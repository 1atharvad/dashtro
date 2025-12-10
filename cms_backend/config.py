from decouple import config

DEBUG = config('DEBUG', default=False, cast=bool)

# Comma-separated list of allowed origins, e.g. http://localhost,https://yourdomain.com
CORS_ORIGINS = config('CORS_ORIGINS', default='http://localhost:7312').split(',')
