import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { autenticarPlataforma, requirePlatformRole } from "../../middlewares/platformAuth";
import { logAudit } from "../../platform/services/auditLog";

const router = Router();
router.use(autenticarPlataforma);
router.use(requirePlatformRole("SUPERADMIN", "OPERATOR", "SUPPORT"));

// GET /api/platform/tenants/:id/conversations
router.get("/tenants/:id/conversations", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { status, page = "1", limit = "30" } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where: Record<string, unknown> = { tenantId: id };
  if (status) where.status = status;

  const [conversations, total] = await Promise.all([
    prisma.botConversation.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      skip,
      take: parseInt(limit),
      include: {
        _count: { select: { messages: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, direction: true, createdAt: true },
        },
      },
    }),
    prisma.botConversation.count({ where }),
  ]);

  await logAudit(req.platformUserId!, "tenant.view_conversations", {
    targetTenantId: id,
    metadata: { page: parseInt(page) },
  });

  res.json({
    conversations: conversations.map((c) => ({
      ...c,
      lastMessage: c.messages[0] ?? null,
      messageCount: c._count.messages,
    })),
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
  });
});

// GET /api/platform/conversations/:id — thread completa
router.get("/conversations/:id", async (req: Request, res: Response): Promise<void> => {
  const conversation = await prisma.botConversation.findUnique({
    where: { id: req.params.id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!conversation) {
    res.status(404).json({ erro: "Conversa não encontrada" });
    return;
  }

  await logAudit(req.platformUserId!, "tenant.view_conversations", {
    targetTenantId: conversation.tenantId,
    metadata: { conversationId: conversation.id },
  });

  res.json(conversation);
});

export default router;
