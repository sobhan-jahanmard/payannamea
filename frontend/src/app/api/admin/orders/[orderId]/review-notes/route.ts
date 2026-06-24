import { requireAdmin } from "../../../../../../server/auth";
import { errorResponse, json } from "../../../../../../server/http";
import { addReviewNote } from "../../../../../../server/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ orderId: string }>;
}

export async function POST(request: Request, context: Context) {
  try {
    await requireAdmin(request);
    const { orderId } = await context.params;
    const note = await addReviewNote(orderId, await request.json());
    return json(
      {
        id: note.id,
        order_id: note.order_id,
        author: note.author,
        note: note.note,
        created_at: note.created_at.toISOString()
      },
      201
    );
  } catch (error) {
    return errorResponse(error);
  }
}
