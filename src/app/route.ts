export async function GET() {
  // Minimal route so Next can build; send "/" to the live homepage
  return Response.redirect('https://www.deshazogroup.com/index.html', 308);
}
