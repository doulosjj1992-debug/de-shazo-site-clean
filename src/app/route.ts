export async function GET() {
  // minimal route so Next can build; redirects root to your real homepage
  return Response.redirect('https://www.deshazogroup.com/index.html', 308);
}
