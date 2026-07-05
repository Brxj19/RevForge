from __future__ import annotations


class ServiceError(Exception):
    pass


class ValidationFailure(ServiceError):
    pass


class ConflictError(ServiceError):
    pass


class AuthenticationError(ServiceError):
    pass


class ForbiddenError(ServiceError):
    pass


class NotFoundError(ServiceError):
    pass
