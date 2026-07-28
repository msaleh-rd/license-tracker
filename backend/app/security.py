from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .db import get_db
from .models import User
from .settings import settings


bearer_scheme = HTTPBearer(auto_error=False)

_jwks_clients: dict[str, PyJWKClient] = {}


def get_jwks_client(jwks_uri: str) -> PyJWKClient:
    if jwks_uri not in _jwks_clients:
        _jwks_clients[jwks_uri] = PyJWKClient(jwks_uri, cache_keys=True)
    return _jwks_clients[jwks_uri]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def create_access_token(subject: str, role: str, *, expires_minutes: int | None = None) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes or settings.access_token_minutes)
    payload = {"sub": subject, "role": role, "exp": expires}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication token") from exc


def decode_keycloak_token(token: str) -> dict[str, Any]:
    keycloak_url = settings.keycloak_url.rstrip("/")
    jwks_uri = f"{keycloak_url}/realms/{settings.keycloak_realm}/protocol/openid-connect/certs"
    client = get_jwks_client(jwks_uri)

    # Try primary lookup by kid in the JWT header
    try:
        signing_key = client.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "HS256"],
            options={"verify_aud": False, "verify_iss": False},
        )
    except (jwt.PyJWKClientError, Exception):
        pass

    # Fallback: try each signing key from the JWKS endpoint
    signing_keys = client.get_signing_keys()
    last_error: Exception | None = None
    for key in signing_keys:
        try:
            return jwt.decode(
                token,
                key.key,
                algorithms=["RS256", "HS256"],
                options={"verify_aud": False, "verify_iss": False},
            )
        except Exception as exc:
            last_error = exc
            continue

    raise last_error or ValueError("No signing keys available from Keycloak JWKS endpoint")


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    token = credentials.credentials

    # 1. Try Keycloak JWT token validation if Keycloak is enabled
    if settings.keycloak_enabled:
        try:
            kc_payload = decode_keycloak_token(token)
            email = (
                kc_payload.get("email")
                or kc_payload.get("preferred_username")
                or kc_payload.get("upn")
                or kc_payload.get("sub")
            )
            if not email:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Keycloak token: missing email claim")

            full_name = (
                kc_payload.get("name")
                or f"{kc_payload.get('given_name', '')} {kc_payload.get('family_name', '')}".strip()
                or email.split("@")[0]
            )

            realm_roles = kc_payload.get("realm_access", {}).get("roles", [])
            client_roles = kc_payload.get("resource_access", {}).get(settings.keycloak_client_id, {}).get("roles", [])
            combined_roles = set(realm_roles + client_roles)

            role = "viewer"
            if "admin" in combined_roles or "superadmin" in combined_roles:
                role = "admin"
            elif "ops" in combined_roles or "operator" in combined_roles or "manager" in combined_roles:
                role = "ops"

            user = db.query(User).filter(User.email == email).one_or_none()
            if user is None:
                user = User(
                    email=email,
                    password_hash=hash_password("keycloak_sso_user"),
                    role=role,
                    full_name=full_name,
                )
                db.add(user)
                db.commit()
                db.refresh(user)
            elif user.full_name != full_name:
                user.full_name = full_name
                db.commit()
                db.refresh(user)

            return user
        except Exception as exc:
            import logging
            logging.warning("Keycloak token decode failed: %s", exc)
            pass

    # 2. Local token verification fallback
    payload = decode_access_token(token)
    user = db.query(User).filter(User.email == payload.get("sub")).one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_roles(*allowed_roles: str):
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return dependency