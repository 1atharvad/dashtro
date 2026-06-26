from decouple import config

DEBUG = config("DEBUG", default=False, cast=bool)

# Comma-separated list of allowed origins, e.g. http://localhost,https://yourdomain.com
CORS_ORIGINS = config("CORS_ORIGINS", default="http://localhost:7312").split(",")

# Public-facing base URL used to build absolute media paths in API responses.
# Set this when running behind Docker or a reverse proxy so that media URLs
# returned to browsers use the correct external hostname instead of the
# container-internal address (e.g. host.docker.internal).
# Example: CMS_PUBLIC_URL=http://localhost:7312
CMS_PUBLIC_URL = config("CMS_PUBLIC_URL", default="")
