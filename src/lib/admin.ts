export function isAdmin(request: Request) {
  const expected = process.env.ADMIN_PASSWORD;
  return !!expected && request.headers.get("x-admin-password") === expected;
}
