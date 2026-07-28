import { PrismaClient, OrderStatus, PaymentMethod, Prisma } from "@prisma/client";
import {
  SEED_ESTS,
  SEED_EVENTS,
  SEASON,
  SEED_ORDERS as ADMIN_SEED_ORDERS,
} from "../lib/data/admin";
import { establishments as RANKING } from "../lib/data/establishments";
import { SEED_MENU, SEED_ORDERS, SEED_QRS, SEED_PROFILE } from "../lib/data/panel";
import { hashPassword } from "../lib/auth/password";
import { computeTotals, splitShares, GATEWAY_FEE_PCT } from "../lib/domain/pricing";

const prisma = new PrismaClient();

const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const PAY_MAP: Record<string, PaymentMethod> = {
  credito: PaymentMethod.CREDIT,
  debito: PaymentMethod.DEBIT,
  pix: PaymentMethod.PIX,
  usdc: PaymentMethod.USDC,
};
const STATUS_MAP: Record<string, OrderStatus> = {
  aguardando: OrderStatus.AWAITING_PAYMENT,
  producao: OrderStatus.IN_PRODUCTION,
  entregue: OrderStatus.DELIVERED,
};

async function main() {
  const now = Date.now();

  for (const e of SEED_ESTS) {
    const slug = e.id === "live" ? "quiosque-do-mar" : slugify(e.name);
    const isDemo = e.id === "live";

    const rank = RANKING.find((r) => r.id === e.id);
    const rankingFields = {
      cuisine: rank?.cuisine ?? null,
      rating: rank && rank.rating != null ? new Prisma.Decimal(rank.rating) : null,
      rankingOrders: rank?.orders ?? 0,
      weeklyHours: rank ? (rank.hours as Prisma.InputJsonValue) : Prisma.DbNull,
    };

    const est = await prisma.establishment.upsert({
      where: { slug },
      update: { isLive: isDemo, ...rankingFields },
      create: {
        slug,
        name: e.name,
        owner: e.owner,
        type: e.tipo,
        city: e.city,
        neighborhood: e.neigh || null,
        posto: e.posto || null,
        radiusM: e.radius ? Number(e.radius) : null,
        plan: e.plan,
        platformFeePct: Math.round(parseFloat(e.fee.replace(",", ".")) || 8),
        serviceFeePct: isDemo ? Number(SEED_PROFILE.serviceFee) : 10,
        status: e.status === "ativo" ? "ACTIVE" : "PAUSED",
        isLive: isDemo,
        tagline: isDemo ? SEED_PROFILE.tagline : null,
        description: isDemo ? SEED_PROFILE.desc : null,
        address: isDemo ? SEED_PROFILE.address : null,
        hours: isDemo ? SEED_PROFILE.hours : null,
        phone: e.phone || null,
        email: e.email || null,
        website: e.website || null,
        whatsapp: e.whatsapp || null,
        instagram: e.instagram || null,
        ...rankingFields,
      },
    });

    // Every establishment with credentials gets an ESTABLISHMENT login.
    if (e.user && e.password) {
      await prisma.user.upsert({
        where: { email: e.user.toLowerCase() },
        // Standardized password for all establishment logins (easy testing).
        update: { passwordHash: await hashPassword("demo1234") },
        create: {
          email: e.user.toLowerCase(),
          passwordHash: await hashPassword("demo1234"),
          name: e.name,
          role: "ESTABLISHMENT",
          establishmentId: est.id,
        },
      });
    }

    if (!isDemo) continue;

    // Quiosque do Mar: full menu, QR spots, and sample orders.
    // (No unique constraint on MenuItem; guard the whole loop so re-running the seed doesn't duplicate rows.)
    const menuCount = await prisma.menuItem.count({ where: { establishmentId: est.id } });
    if (menuCount === 0) {
      for (const m of SEED_MENU) {
        await prisma.menuItem.create({
          data: {
            establishmentId: est.id,
            name: m.name,
            description: m.desc,
            price: m.price,
            oldPrice: m.old ?? null,
            photo: m.photo || null,
            measure: m.measure ?? null,
            unit: m.unit ?? null,
            category: m.cat,
            subcategory: m.sub,
            sortOrder: m.id,
          },
        });
      }
    }

    for (const q of SEED_QRS) {
      await prisma.qrSpot.upsert({
        where: { establishmentId_label: { establishmentId: est.id, label: q.label } },
        update: {},
        create: { establishmentId: est.id, label: q.label },
      });
    }

    for (const o of SEED_ORDERS) {
      const orderExists = await prisma.order.findUnique({ where: { code: o.code } });
      if (orderExists) continue;

      const subtotal = o.items.reduce((s, [qty, , price]) => s + qty * price, 0);
      const { platformFee, serviceFee, total } = computeTotals(
        subtotal,
        est.platformFeePct,
        est.serviceFeePct,
      );
      const method = PAY_MAP[o.pay];
      const createdAt = new Date(now - o.minutesAgo * 60000);
      const splits = o.splits;

      await prisma.order.create({
        data: {
          establishmentId: est.id,
          code: o.code,
          status: STATUS_MAP[o.st],
          locationLabel: o.loc,
          posto: o.posto ?? null,
          customerName: o.cust || null,
          note: o.note ?? null,
          subtotal,
          platformFee,
          serviceFee,
          total,
          createdAt,
          items: {
            create: o.items.map(([qty, name, price]) => ({ name, qty, unitPrice: price })),
          },
          ...(splits
            ? {
                splitShares: {
                  create: splitShares(total, splits.people).map((amount, idx) => {
                    const paid = idx < splits.paid;
                    return {
                      personIndex: idx,
                      amount,
                      method: paid ? method : null,
                      paid,
                      paidAt: paid ? createdAt : null,
                    };
                  }),
                },
              }
            : {
                payment: {
                  create: {
                    method,
                    installments: 1,
                    gatewayFeePct: GATEWAY_FEE_PCT[method],
                    cardMask: o.card || null,
                  },
                },
              }),
        },
      });
    }
  }

  // ---- MonthlyStat rollup (baselines × seasonality), 12 months from `since`.
  const monthMap = new Map<string, string>(); // adminEstId -> db establishment id
  for (const e of SEED_ESTS) {
    const slug = e.id === "live" ? "quiosque-do-mar" : slugify(e.name);
    const dbEst = await prisma.establishment.findUnique({ where: { slug } });
    if (dbEst) monthMap.set(e.id, dbEst.id);
  }

  const nowD = new Date(now);
  for (const e of SEED_ESTS) {
    const dbId = monthMap.get(e.id);
    if (!dbId) continue;
    // Parse "YYYY-MM-DD" by hand (not `new Date(str)`, which parses as UTC and
    // then drifts across the local-time month boundary via `setDate`, silently
    // dropping the join month itself in negative-UTC-offset timezones).
    const [sinceY, sinceM] = e.since.split("-").map(Number);
    const sinceMonthStart = new Date(sinceY, sinceM - 1, 1).getTime();
    const totalPay = e.byPay.credito + e.byPay.debito + e.byPay.pix + e.byPay.usdc || 1;
    for (let i = 0; i < 12; i++) {
      const d = new Date(nowD.getFullYear(), nowD.getMonth() - i, 1);
      if (d.getTime() < sinceMonthStart) continue; // skip pre-join months
      const season = SEASON[d.getMonth()];
      const gmv = +(e.revenue * season).toFixed(2);
      const orders = Math.round(e.orders * season);
      const share = (v: number) => +((gmv * v) / totalPay).toFixed(2);
      await prisma.monthlyStat.upsert({
        where: {
          establishmentId_year_month: {
            establishmentId: dbId,
            year: d.getFullYear(),
            month: d.getMonth() + 1,
          },
        },
        update: {},
        create: {
          establishmentId: dbId,
          year: d.getFullYear(),
          month: d.getMonth() + 1,
          orders,
          gmv,
          byCredit: share(e.byPay.credito),
          byDebit: share(e.byPay.debito),
          byPix: share(e.byPay.pix),
          byUsdc: share(e.byPay.usdc),
        },
      });
    }
  }

  // ---- Search events (landing analytics)
  const evField: Record<string, "city" | "neighborhood" | "cuisine" | "type"> = {
    city: "city",
    neighborhood: "neighborhood",
    cuisine: "cuisine",
    tipo: "type",
  };
  // (No unique constraint on SearchEvent; guard the whole loop so re-running the seed doesn't duplicate rows.)
  if ((await prisma.searchEvent.count()) === 0) {
    for (const ev of SEED_EVENTS) {
      const col = evField[ev.field];
      if (!col) continue;
      await prisma.searchEvent.create({
        data: {
          [col]: ev.value,
          createdAt: new Date(now - ev.day * 86400000),
        },
      });
    }
  }

  // ---- Backlog orders (cross-establishment), items parsed from the summary string.
  const parseItems = (s: string) =>
    s.split(",").map((part) => {
      const m = part.trim().match(/^(\d+)×?\s*(.+)$/);
      return m ? { qty: Number(m[1]), name: m[2].trim() } : { qty: 1, name: part.trim() };
    });
  for (const o of ADMIN_SEED_ORDERS) {
    const dbId = monthMap.get(o.est);
    if (!dbId) continue;
    const exists = await prisma.order.findUnique({ where: { code: o.code } });
    if (exists) continue;
    const method = PAY_MAP[o.m]; // undefined for "split"
    const createdAt = new Date(now - o.minutesAgo * 60000);
    await prisma.order.create({
      data: {
        establishmentId: dbId,
        code: o.code,
        status: "DELIVERED",
        locationLabel: "—",
        customerName: o.cust || null,
        subtotal: o.total,
        platformFee: 0,
        serviceFee: 0,
        total: o.total,
        createdAt,
        items: { create: parseItems(o.items).map((i) => ({ name: i.name, qty: i.qty, unitPrice: 0 })) },
        ...(method
          ? { payment: { create: { method, installments: 1, gatewayFeePct: GATEWAY_FEE_PCT[method], cardMask: o.card || null } } }
          : { splitShares: { create: [{ personIndex: 0, amount: o.total, method: null, paid: false }] } }),
      },
    });
  }

  // Admin user (no establishment).
  await prisma.user.upsert({
    where: { email: "admin@jurandir.app" },
    update: {},
    create: {
      email: "admin@jurandir.app",
      passwordHash: await hashPassword("admin1234"),
      name: "Administração Jurandir",
      role: "ADMIN",
    },
  });

  const counts = {
    establishments: await prisma.establishment.count(),
    users: await prisma.user.count(),
    menuItems: await prisma.menuItem.count(),
    orders: await prisma.order.count(),
  };
  console.log("seed OK", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
