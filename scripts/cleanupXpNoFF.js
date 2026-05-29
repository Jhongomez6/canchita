/**
 * Cleanup retroactivo del XP que se leakeo a usuarios SIN la FF `xpEnabled` activa.
 *
 * Contexto:
 *   Las Cloud Functions de XP (functions/src/xp.ts) originalmente otorgaban XP
 *   y emitian notifs in-app a TODOS los jugadores. La in-app notif bell lee
 *   `notifications/{uid}/items` globalmente, asi que los users sin FF veian
 *   notifs de "subiste al Nivel X" que no tenian contexto.
 *
 *   Tras el fix (server-side `hasXpAccess`), los triggers ya no escriben para
 *   users sin FF. Este script LIMPIA lo que ya se acumulo en produccion.
 *
 * Que limpia para cada usuario SIN acceso (no super_admin Y `xpEnabled !== true`):
 *   1. `notifications/{uid}/items` con type IN ['xp_level_up', 'xp_tier_up', 'xp_achievement']
 *   2. Campos en `users/{uid}`: xp, xpLevel, xpTier, xpLastEvent, achievements, _migration.xpBackfillV1
 *   3. `xpEvents` con uid == este uid
 *
 * Que NO toca:
 *   - Stats generales (played, won, draw, mvpAwards, kudosSummary) — se preservan
 *     para que cuando se active la FF, scripts/backfillXp.js pueda aplicar el retroactivo.
 *   - Usuarios con la FF activa o super_admins — se omiten.
 *
 * Uso:
 *   node scripts/cleanupXpNoFF.js --dry-run            -> preview sin escribir (RECOMENDADO primero)
 *   node scripts/cleanupXpNoFF.js                       -> ejecucion real
 *   node scripts/cleanupXpNoFF.js <userId> --dry-run    -> preview un solo user
 *   node scripts/cleanupXpNoFF.js <userId>              -> limpiar un solo user
 */

const admin = require("firebase-admin");
const path = require("path");

const serviceAccountPath = path.join(__dirname, "../serviceAccountKey.json");
try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} catch (error) {
  console.error("ERROR: No se encontro serviceAccountKey.json en la raiz del proyecto.");
  process.exit(1);
}

const db = admin.firestore();

const XP_NOTIF_TYPES = ["xp_level_up", "xp_tier_up", "xp_achievement"];

// ========================
// HELPERS
// ========================

function hasXpAccess(userData) {
  if (userData.xpEnabled === true) return true;
  const roles = userData.roles;
  const isAdmin = Array.isArray(roles) && roles.includes("admin");
  return isAdmin && userData.adminType === "super_admin";
}

/**
 * Borra docs en batches de hasta 400 (limite Firestore es 500, dejamos margen).
 */
async function deleteDocsBatched(refs, dryRun) {
  if (refs.length === 0) return 0;
  if (dryRun) return refs.length;

  let deleted = 0;
  for (let i = 0; i < refs.length; i += 400) {
    const slice = refs.slice(i, i + 400);
    const batch = db.batch();
    for (const ref of slice) batch.delete(ref);
    await batch.commit();
    deleted += slice.length;
  }
  return deleted;
}

// ========================
// CLEANUP POR USUARIO
// ========================

async function cleanupUser(uid, options) {
  const { dryRun } = options;
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    return { uid, status: "skip_no_doc" };
  }

  const data = userSnap.data() || {};

  if (hasXpAccess(data)) {
    return { uid, status: "skip_has_access" };
  }

  // ¿Hay algo que limpiar? Si todos los campos XP estan ya vacios y no hay notifs/eventos,
  // marcamos como "clean" para reportar.
  const hasXpFields = data.xp != null || data.xpLevel != null || data.xpTier != null
    || data.xpLastEvent != null || data.achievements != null
    || (data._migration && data._migration.xpBackfillV1 != null);

  // 1) Notifs xp_* del user
  const notifsRef = db.collection("notifications").doc(uid).collection("items");
  const notifsSnap = await notifsRef.where("type", "in", XP_NOTIF_TYPES).get();
  const notifRefs = notifsSnap.docs.map((d) => d.ref);

  // 2) xpEvents del user
  const eventsSnap = await db.collection("xpEvents").where("uid", "==", uid).get();
  const eventRefs = eventsSnap.docs.map((d) => d.ref);

  const summary = {
    uid,
    name: data.name || data.displayName || "(sin nombre)",
    xp: data.xp,
    xpLevel: data.xpLevel,
    xpTier: data.xpTier,
    notifsToDelete: notifRefs.length,
    eventsToDelete: eventRefs.length,
    achievementsCount: data.achievements ? Object.keys(data.achievements).length : 0,
  };

  if (!hasXpFields && notifRefs.length === 0 && eventRefs.length === 0) {
    return { ...summary, status: "skip_already_clean" };
  }

  console.log(
    `[${dryRun ? "DRY" : "RUN"}] ${uid} (${summary.name}): ` +
    `xp=${summary.xp ?? "-"} L${summary.xpLevel ?? "-"} ${summary.xpTier ?? "-"} | ` +
    `notifs=${summary.notifsToDelete} events=${summary.eventsToDelete} ` +
    `achievements=${summary.achievementsCount}`
  );

  if (dryRun) return { ...summary, status: "dry_run" };

  // 3) Borrar notifs xp_*
  await deleteDocsBatched(notifRefs, false);

  // 4) Borrar xpEvents del user
  await deleteDocsBatched(eventRefs, false);

  // 5) Limpiar campos XP del user (FieldValue.delete preserva el resto del doc)
  const FieldValue = admin.firestore.FieldValue;
  await userRef.update({
    xp: FieldValue.delete(),
    xpLevel: FieldValue.delete(),
    xpTier: FieldValue.delete(),
    xpLastEvent: FieldValue.delete(),
    achievements: FieldValue.delete(),
    "_migration.xpBackfillV1": FieldValue.delete(),
  });

  return { ...summary, status: "cleaned" };
}

// ========================
// RUNNERS
// ========================

async function runForUser(uid, options) {
  console.log(`Limpiando usuario: ${uid}${options.dryRun ? " (DRY RUN)" : ""}\n`);
  const result = await cleanupUser(uid, options);
  console.log(`\nResultado: ${result.status}`);
  process.exit(0);
}

async function runAll(options) {
  const label = options.dryRun ? " (DRY RUN -- sin escrituras)" : "";
  console.log(`Cleanup XP para usuarios SIN FF activa${label}\n`);

  const usersSnap = await db.collection("users").get();
  console.log(`Usuarios totales en la base: ${usersSnap.size}\n`);

  const summary = {
    cleaned: 0,
    dry_run: 0,
    skip_has_access: 0,
    skip_already_clean: 0,
    skip_no_doc: 0,
    error: 0,
  };

  const totals = { notifs: 0, events: 0, xp: 0, achievements: 0 };

  const BATCH = 5; // baja concurrencia para no saturar Firestore (cada user hace varias queries)
  const uids = usersSnap.docs.map((d) => d.id);

  for (let i = 0; i < uids.length; i += BATCH) {
    const slice = uids.slice(i, i + BATCH);
    const results = await Promise.all(
      slice.map((uid) =>
        cleanupUser(uid, options).catch((err) => {
          console.error(`ERROR ${uid}: ${err.message}`);
          return { uid, status: "error" };
        }),
      ),
    );
    for (const r of results) {
      summary[r.status] = (summary[r.status] || 0) + 1;
      if (r.status === "dry_run" || r.status === "cleaned") {
        totals.notifs += r.notifsToDelete || 0;
        totals.events += r.eventsToDelete || 0;
        totals.xp += r.xp || 0;
        totals.achievements += r.achievementsCount || 0;
      }
    }
  }

  console.log("\nResumen:");
  console.log(`  Cleaned:           ${summary.cleaned || 0}`);
  console.log(`  Dry-run (preview): ${summary.dry_run || 0}`);
  console.log(`  Skip (tiene FF):   ${summary.skip_has_access || 0}`);
  console.log(`  Skip (ya limpio):  ${summary.skip_already_clean || 0}`);
  console.log(`  Skip (sin doc):    ${summary.skip_no_doc || 0}`);
  console.log(`  Errores:           ${summary.error || 0}`);
  console.log(`\nTotales sobre afectados:`);
  console.log(`  Notifs xp_*:       ${totals.notifs}`);
  console.log(`  xpEvents:          ${totals.events}`);
  console.log(`  XP acumulado:      ${totals.xp}`);
  console.log(`  Achievements:      ${totals.achievements}`);

  process.exit(0);
}

// ========================
// ENTRY POINT
// ========================

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const positional = args.find((a) => !a.startsWith("--"));

if (positional) {
  runForUser(positional, { dryRun }).catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
} else {
  runAll({ dryRun }).catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
}
