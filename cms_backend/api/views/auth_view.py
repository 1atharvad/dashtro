from rest_framework.response import Response
from rest_framework.views import APIView
from api.utils import get_auth_client
from cms_backend.settings import DEBUG

dbAuth = get_auth_client()

class AuthView(APIView):
    def _get_token_from_header(self, request):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return None
        return auth_header[len("Bearer "):].strip()

    def get(self, request):
        id_token = dbAuth.get_admin_token_id() if DEBUG else self._get_token_from_header(request)
        if not id_token:
            return Response({"error": "Authorization header missing or invalid"}, status=401)

        try:
            uid = dbAuth.verify_id_token(id_token)
            return Response({
                "message": "Authenticated",
                "uid": uid["uid"],
                "email": uid["email"],
                "email_verified": uid["email_verified"]
            }, status=200)
        except Exception as e:
            return Response({"error": str(e)}, status=401)

    def post(self, request):
        id_token = self._get_token_from_header(request)
        if not id_token:
            return Response({"error": "Authorization header missing or invalid"}, status=401)

        try:
            user_data = dbAuth.verify_id_token(id_token)
            return Response({"message": "Token valid", "user": user_data}, status=200)
        except Exception as e:
            return Response({"error": str(e)}, status=401)
