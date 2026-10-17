export async function POST() {
  return Response.json(
    {
      message: "Goal investigations now run through the agent at POST /api/chat.",
    },
    { status: 410 },
  );
}
