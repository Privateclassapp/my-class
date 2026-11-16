(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Portal = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PORTAL_VERSION = 1;
  var INBOX_VERSION = 1;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function uid() {
    if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return 'proof-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function isIsoDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  function cleanCharge(charge) {
    return {
      id: charge.id,
      kind: charge.kind,
      planKey: charge.planKey,
      planName: charge.planName || '',
      classId: charge.classId || null,
      date: charge.date,
      amount: Number(charge.amount) || 0,
      termNumber: charge.termNumber || null,
      monthKey: charge.monthKey || null,
      sessionFrom: charge.sessionFrom || null,
      sessionTo: charge.sessionTo || null,
      status: charge.status || ''
    };
  }

  function cleanHistory(entry) {
    return {
      id: entry.id || '',
      planKey: entry.planKey || '',
      planName: entry.planName || '',
      date: entry.date,
      status: entry.status || '',
      canceled: entry.canceled || 'none',
      counted: entry.countsTowardTerm !== false,
      kind: entry.kind || ''
    };
  }

  function cleanTermProgress(progress) {
    if (!progress) return null;
    return {
      size: Number(progress.size) || 10,
      counted: Number(progress.counted) || 0,
      termNumber: Number(progress.termNumber) || 0,
      inTerm: Number(progress.inTerm) || 0,
      startedTerms: Number(progress.startedTerms) || 0,
      currentTermFee: Number(progress.currentTermFee) || 0
    };
  }

  function cleanPlan(plan, data) {
    var cls = plan.classId ? (data.classes || []).find(function (c) { return c.id === plan.classId; }) : null;
    return {
      key: plan.key,
      type: plan.type,
      classId: plan.classId || null,
      name: plan.name || '',
      classType: cls ? cls.type : null,
      model: plan.model || 'term',
      active: !!plan.active,
      startDate: plan.startDate || null,
      endDate: plan.endDate || null,
      archived: !!plan.archived,
      totalCharges: Number(plan.totalCharges) || 0,
      termProgress: cleanTermProgress(plan.termProgress),
      charges: (plan.charges || []).map(cleanCharge)
    };
  }

  function buildStudentPortal(data, student, summary, options) {
    var opts = options || {};
    var enrollments = (data.enrollments || []).filter(function (e) { return e.studentId === student.id; });
    var classIds = new Set(enrollments.map(function (e) { return e.classId; }));
    var classesById = {};
    (data.classes || []).forEach(function (c) { classesById[c.id] = c; });
    var summaryPlans = summary && Array.isArray(summary.plans) ? summary.plans : [];
    var plans = summaryPlans.map(function (plan) { return cleanPlan(plan, data); });
    var notes = (data.notes || []).filter(function (note) {
      if (note.visibleToStudent !== true) return false;
      if (note.studentId === student.id) return true;
      return !!(note.classId && classIds.has(note.classId));
    }).map(function (note) {
      var cls = note.classId ? classesById[note.classId] : null;
      return {
        id: note.id,
        date: note.date,
        title: note.title || '',
        body: note.body || '',
        className: cls ? cls.name : '',
        createdAt: note.createdAt || ''
      };
    }).sort(function (a, b) {
      return String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt));
    });
    var grades = (data.grades || []).filter(function (grade) {
      return grade.studentId === student.id;
    }).map(function (grade) {
      return {
        id: grade.id,
        title: grade.title || '',
        score: typeof grade.score === 'number' && isFinite(grade.score) ? grade.score : null,
        note: grade.note || '',
        date: grade.date
      };
    }).sort(function (a, b) {
      return String(b.date).localeCompare(String(a.date));
    });
    var proofs = (data.proofs || []).filter(function (proof) {
      return proof.studentId === student.id;
    }).map(function (proof) {
      return {
        id: proof.id,
        amount: Number(proof.amount) || 0,
        date: proof.date,
        note: proof.note || '',
        status: proof.status,
        submittedAt: proof.submittedAt || proof.createdAt || '',
        reviewedAt: proof.reviewedAt || '',
        reviewNote: proof.reviewNote || '',
        driveLink: proof.driveLink || ''
      };
    }).sort(function (a, b) {
      return String(b.submittedAt).localeCompare(String(a.submittedAt));
    });
    var privatePlan = plans.find(function (plan) { return plan.type === 'private' && plan.charges.length; }) || null;
    var classPlans = plans.filter(function (plan) { return plan.type === 'class'; });
    var attendance = summary && summary.attendance ? {
      total: Number(summary.attendance.total) || 0,
      present: Number(summary.attendance.present) || 0,
      late: Number(summary.attendance.late) || 0,
      absent: Number(summary.attendance.absent) || 0,
      attended: Number(summary.attendance.attended) || 0,
      normal: Number(summary.attendance.normal) || 0,
      canceledCounted: Number(summary.attendance.canceledCounted) || 0,
      canceledMakeup: Number(summary.attendance.canceledMakeup) || 0,
      percentage: Number(summary.attendance.percentage) || 0
    } : null;

    return {
      app: 'my-class-portal',
      schemaVersion: PORTAL_VERSION,
      generatedAt: opts.now || new Date().toISOString(),
      teacherName: opts.teacherName || '',
      studentId: student.id,
      student: {
        id: student.id,
        name: student.name,
        phone: student.phone || '',
        type: student.type || 'private',
        level: student.level || '',
        archived: !!student.archived
      },
      summary: {
        totalCharges: Number(summary && summary.totalCharges) || 0,
        totalPaid: Number(summary && summary.totalPaid) || 0,
        balance: Number(summary && summary.balance) || 0,
        status: summary ? summary.status : 'paid',
        attendance: attendance,
        history: (summary && summary.history ? summary.history : []).map(cleanHistory),
        payments: (summary && summary.payments ? summary.payments : []).map(function (payment) {
          return {
            id: payment.id,
            amount: Number(payment.amount) || 0,
            date: payment.date,
            note: payment.note || ''
          };
        }),
        charges: (summary && summary.charges ? summary.charges : []).map(cleanCharge)
      },
      classes: classPlans.map(function (plan) {
        return {
          id: plan.classId,
          name: plan.name,
          classType: plan.classType,
          model: plan.model,
          active: plan.active,
          startDate: plan.startDate,
          endDate: plan.endDate,
          archived: plan.archived,
          totalCharges: plan.totalCharges,
          termProgress: plan.termProgress
        };
      }),
      privatePlan: privatePlan ? {
        model: privatePlan.model,
        active: privatePlan.active,
        startDate: privatePlan.startDate,
        endDate: privatePlan.endDate,
        totalCharges: privatePlan.totalCharges,
        termProgress: privatePlan.termProgress
      } : null,
      plans: plans,
      grades: grades,
      notes: notes,
      proofs: proofs
    };
  }

  function emptyInbox(studentId) {
    return {
      app: 'my-class-inbox',
      schemaVersion: INBOX_VERSION,
      studentId: studentId,
      submissions: [],
      updatedAt: new Date().toISOString()
    };
  }

  function validateInbox(payload, expectedStudentId) {
    if (!payload || typeof payload !== 'object') return { ok: false, error: 'invalid' };
    if (payload.app !== 'my-class-inbox' || payload.schemaVersion !== INBOX_VERSION) return { ok: false, error: 'version' };
    if (!payload.studentId || (expectedStudentId && payload.studentId !== expectedStudentId)) return { ok: false, error: 'student' };
    if (!Array.isArray(payload.submissions)) return { ok: false, error: 'invalid' };
    for (var i = 0; i < payload.submissions.length; i++) {
      var item = payload.submissions[i];
      if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 200) return { ok: false, error: 'submission' };
      if (typeof item.amount !== 'number' || !isFinite(item.amount) || item.amount <= 0) return { ok: false, error: 'amount' };
      if (!isIsoDate(item.date)) return { ok: false, error: 'date' };
      if (typeof item.data !== 'string' || !item.data) return { ok: false, error: 'image' };
      if (item.mime && !/^image\/(jpeg|png|webp)$/.test(item.mime)) return { ok: false, error: 'mime' };
    }
    return { ok: true };
  }

  function validatePortal(payload, expectedStudentId) {
    if (!payload || typeof payload !== 'object') return { ok: false, error: 'invalid' };
    if (payload.app !== 'my-class-portal' || payload.schemaVersion !== PORTAL_VERSION) return { ok: false, error: 'version' };
    if (!payload.studentId || !payload.student || (expectedStudentId && payload.studentId !== expectedStudentId)) return { ok: false, error: 'student' };
    if (!payload.summary || typeof payload.summary !== 'object') return { ok: false, error: 'invalid' };
    if (!Array.isArray(payload.grades) || !Array.isArray(payload.notes) || !Array.isArray(payload.proofs)) return { ok: false, error: 'invalid' };
    return { ok: true };
  }

  function makeSubmission(input) {
    var value = input || {};
    var data = String(value.data || '');
    var comma = data.indexOf(',');
    if (data.indexOf(';base64,') >= 0 && comma >= 0) data = data.slice(comma + 1);
    return {
      id: uid(),
      amount: Number(value.amount) || 0,
      date: value.date,
      note: String(value.note || '').slice(0, 500),
      mime: value.mime || 'image/jpeg',
      fileName: String(value.fileName || 'proof.jpg').slice(0, 180),
      data: data,
      submittedAt: new Date().toISOString()
    };
  }

  function appendSubmission(inbox, submission) {
    var next = clone(inbox || emptyInbox(''));
    next.submissions = Array.isArray(next.submissions) ? next.submissions : [];
    if (!next.submissions.some(function (item) { return item.id === submission.id; })) {
      next.submissions.push(submission);
    }
    next.updatedAt = new Date().toISOString();
    return next;
  }

  function hash(value) {
    return JSON.stringify(value);
  }

  return {
    PORTAL_VERSION: PORTAL_VERSION,
    INBOX_VERSION: INBOX_VERSION,
    buildStudentPortal: buildStudentPortal,
    emptyInbox: emptyInbox,
    validateInbox: validateInbox,
    validatePortal: validatePortal,
    makeSubmission: makeSubmission,
    appendSubmission: appendSubmission,
    hash: hash
  };
});
