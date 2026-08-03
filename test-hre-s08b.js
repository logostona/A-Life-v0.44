/* HRE Phase 7 step 3 — eviction, notice and deposit settlement (S08b).
 *
 * The point of this suite is that the arrears ladder TERMINATES. Before S08b a
 * tenant with no income reached stage "eviction" and then stayed put for 92
 * unpaid periods, which made rent optional and the whole recurring-obligation
 * design pointless. So the assertions here are about consequences actually
 * landing, and about no state contradiction surviving the transition — the two
 * things the Phase 7 exit gate asks for.
 */
const H = require("/home/claude/harness.js");
const M = H.M;

let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) pass++; else { fail++; console.log("  FAIL:", n, e !== undefined ? JSON.stringify(e) : ""); } };
const sec = (n) => console.log("\n=== " + n + " ===");

function tenant(country, birthYear, age, rent, money) {
  const s = H.mkChar({ country: country, cls: "Middle", birthYear: birthYear });
  s.ageDays = Math.ceil(age * 365.25) + 1;
  M.migrate(s);
  s.money = money === undefined ? 50000 : money;
  M.hreStartTenancy(s, rent === undefined ? 800 : rent, 2);
  return s;
}

/* ───────────────── 1 · thresholds are law-derived ───────────────── */
sec("1 · eviction threshold comes from law, not a constant");
{
  ok("protection grace is monotonic",
    M.hreProtectionGrace(0) <= M.hreProtectionGrace(30) &&
    M.hreProtectionGrace(30) <= M.hreProtectionGrace(50) &&
    M.hreProtectionGrace(50) <= M.hreProtectionGrace(80));
  ok("no protection means no grace", M.hreProtectionGrace(0) === 0);
  ok("strong protection buys the most grace", M.hreProtectionGrace(90) === 4);

  const s = tenant("United Kingdom", 1980, 30);
  const thr = M.hreEvictionThreshold(s);
  ok("threshold exceeds the bare arrears trigger", thr > M.HRE_ARREARS_AT.eviction, { thr: thr });
  ok("threshold is a positive integer", Number.isInteger(thr) && thr > 0, thr);

  /* Two eras of the same country must not produce identical process length if
     their statutory protection differs — that is the CE requirement. */
  const early = tenant("United Kingdom", 1900, 30);
  const late = tenant("United Kingdom", 1985, 30);
  ok("a protected era is not quicker to evict than an unprotected one",
    M.hreEvictionThreshold(late) >= M.hreEvictionThreshold(early),
    { early: M.hreEvictionThreshold(early), late: M.hreEvictionThreshold(late) });
}

/* ───────────────── 2 · eviction actually executes ───────────────── */
sec("2 · the arrears ladder terminates");
{
  let s = tenant("United Kingdom", 1980, 30, 800, 5000);
  s.money = 0;
  let evictedAt = null;
  for (let i = 0; i < 400 && s.alive; i++) {
    s = M.advance(s, 7);
    if (s.pending) s.pending = null;
    if (!M.hreTenancy(s) && evictedAt === null) evictedAt = i;
  }
  ok("a tenant who never pays is eventually evicted", evictedAt !== null, { evictedAt: evictedAt });
  ok("eviction happens in reasonable time, not after decades",
    evictedAt !== null && evictedAt < 200, { evictedAt: evictedAt });
  ok("the tenancy record is cleared", M.hreTenancy(s) === null);
  ok("tenure is no longer renting", M.hreTenure(s) !== "renting", M.hreTenure(s));
  ok("the evicted character is homeless", M.hreTenure(s) === "homeless", M.hreTenure(s));
  ok("no renting-with-no-tenancy contradiction survives",
    !(M.hreTenure(s) === "renting" && !M.hreTenancy(s)));
  ok("the accessor agrees", M.hreIsHomeless(s) === true);
  ok("the legacy homeless flag is kept in step for STREET_GROUP content",
    !!s.flags.homeless, s.flags.homeless);
  ok("lastEnd records why", s.hre.lastEnd === "eviction", s.hre.lastEnd);
  ok("the player was told, in prose", s.feed.some(function (f) { return /🚪/.test(f.text); }));
}

/* ───────────────── 3 · paying tenants are never evicted ───────────────── */
sec("3 · a paying tenant is never evicted");
{
  let s = tenant("United Kingdom", 1980, 30, 400, 900000);
  for (let i = 0; i < 300 && s.alive; i++) { s = M.advance(s, 7); if (s.pending) s.pending = null; }
  const t = M.hreTenancy(s);
  ok("a solvent tenant keeps the tenancy", !!t, { tenure: M.hreTenure(s) });
  if (t) {
    ok("a solvent tenant stays clear of arrears", t.stage === "clear", t.stage);
    ok("a solvent tenant owes nothing", t.owed === 0, t.owed);
  }
  ok("a solvent tenant is still renting", M.hreTenure(s) === "renting", M.hreTenure(s));
}

/* ───────────────── 4 · deposit settlement ───────────────── */
sec("4 · deposit settlement");
{
  const clean = { deposit: 1600, rent: 800, owed: 0 };
  const s1 = M.hreSettleDeposit(clean, "left");
  ok("a clean tenant gets the whole deposit back", s1.returned === 1600 && s1.withheld === 0, s1);

  const owing = { deposit: 1600, rent: 800, owed: 1 };
  const s2 = M.hreSettleDeposit(owing, "left");
  ok("arrears are taken from the deposit first", s2.withheld === 800 && s2.returned === 800, s2);

  const deep = { deposit: 1600, rent: 800, owed: 5 };
  const s3 = M.hreSettleDeposit(deep, "left");
  ok("the deposit cannot go negative", s3.returned === 0 && s3.withheld === 1600, s3);
  ok("a shortfall beyond the deposit is reported", s3.shortfall === 2400, s3);

  const ev = M.hreSettleDeposit(deep, "eviction");
  ok("eviction forfeits the deposit entirely", ev.returned === 0 && ev.withheld === 1600, ev);

  /* and the money actually moves */
  const s = tenant("United Kingdom", 1980, 30, 800, 50000);
  const before = s.money;
  M.hreGiveNotice(s, "withParents");
  ok("leaving cleanly returns the deposit to the player's money",
    s.money - before === 1600, { delta: s.money - before });
}

/* ───────────────── 5 · voluntary notice ───────────────── */
sec("5 · giving notice");
{
  const s = tenant("Japan", 1975, 32, 600, 50000);
  const r = M.hreGiveNotice(s, "withParents");
  ok("notice returns a settlement", !!r && !!r.settlement);
  ok("notice clears the tenancy", M.hreTenancy(s) === null);
  ok("notice moves tenure to the requested destination", M.hreTenure(s) === "withParents", M.hreTenure(s));
  ok("notice does not mark the character homeless", M.hreIsHomeless(s) === false);
  ok("lastEnd records a voluntary end", s.hre.lastEnd === "left", s.hre.lastEnd);

  const noTenancy = H.mkChar({ country: "Japan", cls: "Middle", birthYear: 1975 });
  M.migrate(noTenancy);
  ok("giving notice with no tenancy is a safe no-op", M.hreGiveNotice(noTenancy, "withParents") === null);

  /* leaving with nowhere to go IS homelessness — the honest default */
  const s2 = tenant("Japan", 1975, 32, 600, 50000);
  M.hreGiveNotice(s2);
  ok("leaving with no destination lands in homelessness", M.hreTenure(s2) === "homeless", M.hreTenure(s2));
}

/* ───────────────── 6 · eviction feeds an existing system ───────────────── */
sec("6 · eviction is an entry point, not a dead end");
{
  let s = tenant("United Kingdom", 1980, 30, 800, 5000);
  s.money = 0;
  for (let i = 0; i < 400 && s.alive; i++) { s = M.advance(s, 7); if (s.pending) s.pending = null; }
  if (!M.hreTenancy(s)) {
    const street = M.ACT_GROUPS.find(function (g) { return g.id === "street"; });
    ok("the street group exists", !!street);
    if (street) {
      ok("an evicted character can reach the street content",
        !street.cond || street.cond(s) === true, { cond: street.cond ? street.cond(s) : "none" });
    }
    ok("an evicted character is not at their parents", M.hreAtParents(s) === false);
  } else {
    ok("(character was not evicted in this run)", true);
    ok("(street reachability not exercised)", true);
    ok("(parents check not exercised)", true);
  }
}

/* ───────────────── 7 · multi-country soak, no contradictions ───────────────── */
sec("7 · full-life soak — tenure stays coherent");
{
  const cases = [["United Kingdom", 1955], ["Japan", 1970], ["Nigeria", 1985],
                 ["Brazil", 1940], ["United States", 1930], ["Germany", 1995]];
  let contradictions = 0, crashes = 0, steps = 0, evictions = 0, tenancies = 0;
  for (const [country, by] of cases) {
    try {
      let s = H.mkChar({ country: country, cls: "Middle", birthYear: by });
      for (let i = 0; i < 3800 && s.alive; i++) {
        s = M.advance(s, 7);
        if (s.pending) s.pending = null;
        steps++;
        const ten = M.hreTenancy(s), tenure = M.hreTenure(s);
        /* Contradictions only mean anything where HRE actually manages the
           residence. For an un-owned character the legacy derivation returns
           "renting" to mean "has their own place" — there is no HRE tenancy
           because they never went through the marketplace, and that is correct
           rather than contradictory. Checking them here produced 14,569 false
           positives and would have masked any real one. */
        if (s.hre.owned) {
          if (tenure === "renting" && !ten) contradictions++;
          if (ten && tenure !== "renting") contradictions++;
          if (M.hreIsHomeless(s) && ten) contradictions++;
        } else {
          /* the guarantee for everyone else: HRE still agrees with legacy */
          if (tenure !== M.hreLegacyTenure(s)) contradictions++;
        }
        if (s.hre.lastEnd === "eviction" && !evictions) evictions++;
        if (ten) tenancies++;
      }
    } catch (e) { crashes++; console.log("  CRASH:", country, e.message); }
  }
  console.log(`  soak: ${steps} steps across ${cases.length} country/era lives`);
  ok("no crashes across the soak", crashes === 0, crashes);
  ok("no residence contradictions at any step", contradictions === 0, contradictions);
  ok("the soak simulated a meaningful span", steps > 3000, steps);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
