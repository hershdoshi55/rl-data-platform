class AppException(Exception):
    """Base application exception.

    Attributes:
        message:     Human-readable description of the error.
        status_code: Suggested HTTP status code for API responses.
    """

    def __init__(self, message: str = "An unexpected error occurred", status_code: int = 500) -> None:
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class NotFoundError(AppException):
    """Raised when a requested resource does not exist."""

    def __init__(self, message: str = "Resource not found") -> None:
        super().__init__(message=message, status_code=404)


class UnauthorizedError(AppException):
    """Raised when authentication credentials are missing or invalid."""

    def __init__(self, message: str = "Unauthorized") -> None:
        super().__init__(message=message, status_code=401)


class ForbiddenError(AppException):
    """Raised when the authenticated user lacks permission."""

    def __init__(self, message: str = "Forbidden") -> None:
        super().__init__(message=message, status_code=403)


class ConflictError(AppException):
    """Raised when a resource already exists (e.g. duplicate email)."""

    def __init__(self, message: str = "Resource already exists") -> None:
        super().__init__(message=message, status_code=409)


class ValidationError(AppException):
    """Raised when business-logic validation fails."""

    def __init__(self, message: str = "Validation error") -> None:
        super().__init__(message=message, status_code=422)


class QueueEmptyError(AppException):
    """Raised when no tasks are available in the assignment queue."""

    def __init__(self, message: str = "No tasks available") -> None:
        super().__init__(message=message, status_code=404)
