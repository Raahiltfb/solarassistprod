import { verifyTicketResolution } from "../lib/verification-engine";

function runPhase6VerificationTests() {
  console.log("==================================================");
  console.log("RUNNING PHASE 6 RESOLUTION / VERIFICATION ENGINE TESTS");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      if (detail) console.error(`   Details: ${detail}`);
      failed++;
    }
  }

  // --- Test 1: Successful String Repair Verification ---
  const ticket1 = {
    id: "ticket-101",
    title: "[String Diagnostic] SUSTAINED UNDERPERFORMANCE - INV-01 String #3",
    status: "resolved",
    priority: "p3" as const,
    resolved_at: new Date(Date.now() - 3600000).toISOString(),
    created_at: new Date(Date.now() - 7200000).toISOString(),
  };

  const postRepairTel1 = [
    { timestamp: new Date().toISOString(), current_a: 5.2, voltage_v: 600 },
    { timestamp: new Date(Date.now() - 300000).toISOString(), current_a: 5.1, voltage_v: 602 },
  ];
  const peerTel1 = [
    { timestamp: new Date().toISOString(), current_a: 5.0, voltage_v: 600 },
    { timestamp: new Date().toISOString(), current_a: 5.1, voltage_v: 601 },
  ];

  const res1 = verifyTicketResolution({
    ticket: ticket1,
    postRepairTelemetry: postRepairTel1,
    peerTelemetry: peerTel1,
    stringIndex: 3,
  });

  assert(
    res1.is_recovered === true &&
    res1.verification_status === "verified_recovered" &&
    res1.new_status === "closed",
    "Test 1: String repair recovery verified post-completion -> transitions status to closed & verified_recovered",
    JSON.stringify(res1)
  );

  // --- Test 2: Failed String Repair Telemetry Auto-Reopen & Escalation ---
  const ticket2 = {
    id: "ticket-102",
    title: "[String Diagnostic] SUSTAINED UNDERPERFORMANCE - INV-01 String #3",
    status: "resolved",
    priority: "p3" as const,
    resolved_at: new Date(Date.now() - 3600000).toISOString(),
    created_at: new Date(Date.now() - 7200000).toISOString(),
    reopened_count: 0,
  };

  // Post repair telemetry shows string is STILL at 0.8A vs 5.1A peer median!
  const postRepairTel2 = [
    { timestamp: new Date().toISOString(), current_a: 0.8, voltage_v: 600 },
    { timestamp: new Date(Date.now() - 300000).toISOString(), current_a: 0.7, voltage_v: 602 },
  ];

  const res2 = verifyTicketResolution({
    ticket: ticket2,
    postRepairTelemetry: postRepairTel2,
    peerTelemetry: peerTel1,
    stringIndex: 3,
  });

  assert(
    res2.is_recovered === false &&
    res2.verification_status === "verification_failed" &&
    res2.new_status === "open" &&
    res2.reopened_count === 1 &&
    res2.new_priority === "p2",
    "Test 2: Persistent fault post-repair triggers automatic ticket reopening & priority escalation (P3 -> P2)",
    JSON.stringify(res2)
  );

  // --- Test 3: Inverter Offline Telemetry Recovery Verification ---
  const ticket3 = {
    id: "ticket-103",
    title: "[Inverter Offline] INV-02 Communication Loss",
    status: "resolved",
    priority: "p2" as const,
    resolved_at: new Date(Date.now() - 3600000).toISOString(),
    created_at: new Date(Date.now() - 7200000).toISOString(),
  };

  const inverterOnline = {
    id: "inv-2",
    status: "online",
    last_seen_at: new Date().toISOString(),
    serial_number: "SN-26081290381",
  };

  const res3 = verifyTicketResolution({
    ticket: ticket3,
    postRepairTelemetry: [],
    inverter: inverterOnline,
  });

  assert(
    res3.is_recovered === true &&
    res3.verification_status === "verified_recovered" &&
    res3.new_status === "closed",
    "Test 3: Inverter offline recovery verified when telemetry heartbeat resumes",
    JSON.stringify(res3)
  );

  // --- Test 4: Inverter Offline Repair Failure ---
  const inverterOffline = {
    id: "inv-2",
    status: "offline",
    last_seen_at: new Date(Date.now() - 7200000).toISOString(),
    serial_number: "SN-26081290381",
  };

  const res4 = verifyTicketResolution({
    ticket: ticket3,
    postRepairTelemetry: [],
    inverter: inverterOffline,
  });

  assert(
    res4.is_recovered === false &&
    res4.verification_status === "verification_failed" &&
    res4.new_status === "open" &&
    res4.new_priority === "p1",
    "Test 4: Inverter remaining offline 30m post-repair triggers automatic ticket reopening & P1 escalation",
    JSON.stringify(res4)
  );

  console.log("==================================================");
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase6VerificationTests();
