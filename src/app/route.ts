export async function GET() {
  // Redirect root to your real homepage
  return Response.redirect('https://www.deshazogroup.com/index.html', 308);
}
