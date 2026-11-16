/* billing.js — all money and attendance calculations.
   This file has no UI code so it can be tested separately.

   Rules implemented:
   - A term is 10 counted sessions. A term fee is added at the 1st, 11th, 21st… counted session.
   - Normal class/private sessions count toward a term even when the student was absent.
   - A canceled session marked "counted" counts toward a term and can be charged.
   - A canceled session marked "makeup" never counts and is never charged.
   - Per-session classes charge Present and Late, plus counted cancellations. Absent is free.
   - Monthly classes charge once for each Jalali month with a normal session or counted cancellation.
   - Class fees are totals, split by the active roster on the charge date. Private fees are fixed.
   - Payments are pooled per student. Balance = charges - payments.
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./jalali.js'));
  } else {
    root.Billing = factory(root.Jalali);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Jalali) {
  'use strict';

  function round(n) {
    return Math.round(Number(n) || 0);
  }

  function dateCmp(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function isEnrolled(enrollment, date) {
    return !!enrollment && enrollment.startDate <= date && (!enrollment.endDate || enrollment.endDate >= date);
  }

  function activeEnrollmentsAt(enrollments, classId, date) {
    return enrollments.filter(function (e) {
      return e.classId === classId && isEnrolled(e, date);
    });
  }

  function activeCountAt(enrollments, classId, date) {
    return activeEnrollmentsAt(enrollments, classId, date).length;
  }

  function findFeeAt(history, date, fallback, amountKey) {
    var entries = Array.isArray(history) ? history.slice() : [];
    if (!entries.length) return Number(fallback) || 0;
    entries.sort(function (a, b) { return dateCmp(a.effectiveFrom || '', b.effectiveFrom || ''); });
    var chosen = entries[0];
    for (var i = 0; i < entries.length; i++) {
      if ((entries[i].effectiveFrom || '') <= date) chosen = entries[i];
      else break;
    }
    var value = chosen[amountKey];
    return Number(value == null ? fallback : value) || 0;
  }

  function classFeeAt(cls, date) {
    return findFeeAt(cls.feeHistory, date, cls.totalFee, 'totalFee');
  }

  function classShareAt(cls, enrollments, date) {
    var fee = classFeeAt(cls, date);
    var count = activeCountAt(enrollments, cls.id, date);
    if (!count) return 0;
    return round(fee / count);
  }

  function privateFeeAt(plan, date) {
    if (!plan) return 0;
    return findFeeAt(plan.feeHistory, date, plan.fee, 'fee');
  }

  function planActive(plan, date) {
    return !!plan && !!plan.startDate && plan.startDate <= date && (!plan.endDate || plan.endDate >= date);
  }

  function emptyAttendance() {
    return {
      present: 0,
      late: 0,
      absent: 0,
      normal: 0,
      attended: 0,
      percentage: 0,
      canceledCounted: 0,
      canceledMakeup: 0,
      canceledTotal: 0
    };
  }

  function finishAttendance(stats) {
    stats.normal = stats.present + stats.late + stats.absent;
    stats.attended = stats.present + stats.late;
    stats.percentage = stats.normal ? Math.round((stats.attended / stats.normal) * 100) : 0;
    stats.canceledTotal = stats.canceledCounted + stats.canceledMakeup;
    return stats;
  }

  function addAttendance(target, source) {
    ['present', 'late', 'absent', 'canceledCounted', 'canceledMakeup'].forEach(function (k) {
      target[k] += source[k] || 0;
    });
    return target;
  }

  function emptyTermProgress(size) {
    return { size: size || 10, counted: 0, termNumber: 0, inTerm: 0, startedTerms: 0, currentTermFee: 0 };
  }

  function makeHistoryEntry(planKey, planName, session, status, canceled, countsTowardTerm) {
    return {
      date: session.date,
      kind: session.ownerType,
      planKey: planKey,
      planName: planName,
      sessionId: session.id,
      status: status,
      canceled: canceled || 'none',
      countsTowardTerm: !!countsTowardTerm,
      createdAt: session.createdAt || ''
    };
  }

  function buildPlanCharges(opts) {
    var plan = opts.plan;
    var model = opts.model;
    var sessions = opts.sessions;
    var attendanceBySession = opts.attendanceBySession;
    var classId = opts.classId || null;
    var planKey = opts.planKey;
    var planName = opts.planName;
    var enrollments = opts.enrollments;
    var termSize = opts.termSize || 10;
    var charges = [];
    var stats = emptyAttendance();
    var history = [];
    var countedDates = [];
    var termProgress = emptyTermProgress(termSize);
    var monthlyFirstDates = {};
    var chargeIndex = 0;

    sessions.slice().sort(function (a, b) {
      return dateCmp(a.date, b.date) || dateCmp(a.createdAt || '', b.createdAt || '');
    }).forEach(function (session) {
      var att = attendanceBySession[session.id] || null;
      var canceled = session.canceled || 'none';

      if (canceled === 'counted' || canceled === 'makeup') {
        if (canceled === 'counted') {
          stats.canceledCounted++;
          countedDates.push(session.date);
          if (model === 'session') {
            var cFee = opts.feeFor(session.date);
            charges.push({
              id: planKey + ':session:' + session.id,
              kind: 'session',
              planKey: planKey,
              planName: planName,
              classId: classId,
              date: session.date,
              amount: cFee,
              sessionId: session.id,
              status: 'canceled'
            });
          }
          if (model === 'month') {
            var cMonth = Jalali.jMonthKey(session.date);
            if (!monthlyFirstDates[cMonth]) monthlyFirstDates[cMonth] = session.date;
          }
        } else {
          stats.canceledMakeup++;
        }
        history.push(makeHistoryEntry(planKey, planName, session, 'canceled', canceled, canceled === 'counted'));
        return;
      }

      // A normal session happened.
      if (model === 'term') countedDates.push(session.date);
      if (model === 'month') {
        var monthKey = Jalali.jMonthKey(session.date);
        if (!monthlyFirstDates[monthKey]) monthlyFirstDates[monthKey] = session.date;
      }
      if (att) {
        if (att.status === 'present') stats.present++;
        else if (att.status === 'late') stats.late++;
        else if (att.status === 'absent') stats.absent++;
        history.push(makeHistoryEntry(planKey, planName, session, att.status, 'none', true));
        if (model === 'session' && (att.status === 'present' || att.status === 'late')) {
          charges.push({
            id: planKey + ':session:' + session.id,
            kind: 'session',
            planKey: planKey,
            planName: planName,
            classId: classId,
            date: session.date,
            amount: opts.feeFor(session.date),
            sessionId: session.id,
            status: att.status
          });
        }
      }
    });

    finishAttendance(stats);

    if (model === 'term') {
      countedDates.sort(dateCmp);
      termProgress.counted = countedDates.length;
      termProgress.termNumber = countedDates.length ? Math.ceil(countedDates.length / termSize) : 0;
      termProgress.inTerm = countedDates.length ? ((countedDates.length - 1) % termSize) + 1 : 0;
      termProgress.startedTerms = termProgress.termNumber;
      for (var i = 0; i < countedDates.length; i += termSize) {
        var termNumber = Math.floor(i / termSize) + 1;
        var startDate = countedDates[i];
        var amount = opts.feeFor(startDate);
        charges.push({
          id: planKey + ':term:' + termNumber,
          kind: 'term',
          planKey: planKey,
          planName: planName,
          classId: classId,
          date: startDate,
          amount: amount,
          termNumber: termNumber,
          sessionFrom: i + 1,
          sessionTo: Math.min(i + termSize, countedDates.length)
        });
        if (termNumber === termProgress.termNumber) termProgress.currentTermFee = amount;
      }
    }

    if (model === 'month') {
      Object.keys(monthlyFirstDates).sort().forEach(function (monthKey) {
        var date = monthlyFirstDates[monthKey];
        charges.push({
          id: planKey + ':month:' + monthKey,
          kind: 'month',
          planKey: planKey,
          planName: planName,
          classId: classId,
          date: date,
          amount: opts.feeFor(date),
          monthKey: monthKey
        });
      });
    }

    charges.sort(function (a, b) { return dateCmp(a.date, b.date) || dateCmp(a.id, b.id); });
    history.sort(function (a, b) { return dateCmp(b.date, a.date) || dateCmp(b.createdAt || '', a.createdAt || ''); });

    return {
      charges: charges,
      attendance: stats,
      history: history,
      termProgress: model === 'term' ? termProgress : null
    };
  }

  function computeStudent(data, student, today) {
    var enrollments = data.enrollments || [];
    var sessions = data.sessions || [];
    var attendance = data.attendance || [];
    var payments = data.payments || [];
    var classes = data.classes || [];
    var classesById = {};
    classes.forEach(function (c) { classesById[c.id] = c; });

    var attendanceBySession = {};
    attendance.forEach(function (a) {
      if (a.studentId === student.id) attendanceBySession[a.sessionId] = a;
    });

    var plans = [];
    var charges = [];
    var history = [];
    var overall = emptyAttendance();
    var termProgressMap = {};

    // Class memberships (including ended ones, so history and balances are not lost).
    enrollments.filter(function (e) { return e.studentId === student.id; }).forEach(function (enrollment) {
      var cls = classesById[enrollment.classId];
      if (!cls) return;
      var planKey = 'class:' + cls.id + ':' + enrollment.id;
      var planSessions = sessions.filter(function (s) {
        return s.ownerType === 'class' && s.classId === cls.id &&
          s.date >= enrollment.startDate && (!enrollment.endDate || s.date <= enrollment.endDate);
      });
      var feeFor = function (date) {
        return classShareAt(cls, enrollments, date);
      };
      var built = buildPlanCharges({
        plan: cls,
        model: cls.priceModel || 'term',
        sessions: planSessions,
        attendanceBySession: attendanceBySession,
        classId: cls.id,
        planKey: planKey,
        planName: cls.name,
        enrollments: enrollments,
        termSize: cls.termSize || 10,
        feeFor: feeFor
      });
      var plan = {
        key: planKey,
        type: 'class',
        classId: cls.id,
        name: cls.name,
        model: cls.priceModel || 'term',
        active: isEnrolled(enrollment, today),
        startDate: enrollment.startDate,
        endDate: enrollment.endDate || null,
        archived: !!cls.archived,
        charges: built.charges,
        totalCharges: built.charges.reduce(function (sum, c) { return sum + c.amount; }, 0),
        attendance: built.attendance,
        history: built.history,
        termProgress: built.termProgress
      };
      plans.push(plan);
      charges = charges.concat(built.charges);
      history = history.concat(built.history);
      addAttendance(overall, built.attendance);
      if (built.termProgress) termProgressMap[planKey] = built.termProgress;
    });

    // Private lessons.
    var plan = student.privatePlan || null;
    var privateSessions = sessions.filter(function (s) {
      if (s.ownerType !== 'private' || s.studentId !== student.id) return false;
      if (!plan) return true;
      if (!plan.startDate) return false;
      if (s.date < plan.startDate) return false;
      if (plan.endDate && s.date > plan.endDate) return false;
      return true;
    });
    if (plan || privateSessions.length) {
      var privatePlanKey = 'private';
      var privateBuilt = buildPlanCharges({
        plan: plan,
        model: plan ? (plan.model || 'term') : 'none',
        sessions: privateSessions,
        attendanceBySession: attendanceBySession,
        classId: null,
        planKey: privatePlanKey,
        planName: '',
        enrollments: enrollments,
        termSize: plan && plan.termSize ? plan.termSize : 10,
        feeFor: function (date) {
          if (!plan) return 0;
          return round(privateFeeAt(plan, date));
        }
      });
      var privatePlan = {
        key: privatePlanKey,
        type: 'private',
        classId: null,
        name: '',
        model: plan ? (plan.model || 'term') : 'none',
        active: plan ? planActive(plan, today) : false,
        startDate: plan ? plan.startDate : null,
        endDate: plan ? (plan.endDate || null) : null,
        billingEnabled: !!plan,
        charges: plan ? privateBuilt.charges : [],
        totalCharges: plan ? privateBuilt.charges.reduce(function (sum, c) { return sum + c.amount; }, 0) : 0,
        attendance: privateBuilt.attendance,
        history: privateBuilt.history,
        termProgress: plan ? privateBuilt.termProgress : null
      };
      plans.push(privatePlan);
      if (plan) charges = charges.concat(privateBuilt.charges);
      history = history.concat(privateBuilt.history);
      addAttendance(overall, privateBuilt.attendance);
      if (plan && privateBuilt.termProgress) termProgressMap[privatePlanKey] = privateBuilt.termProgress;
    }

    finishAttendance(overall);
    charges.sort(function (a, b) { return dateCmp(b.date, a.date) || dateCmp(b.id, a.id); });
    history.sort(function (a, b) { return dateCmp(b.date, a.date) || dateCmp(b.createdAt || '', a.createdAt || ''); });
    var studentPayments = payments.filter(function (p) { return p.studentId === student.id; })
      .slice().sort(function (a, b) { return dateCmp(b.date, a.date) || dateCmp(b.createdAt || '', a.createdAt || ''); });
    var totalCharges = charges.reduce(function (sum, c) { return sum + c.amount; }, 0);
    var totalPaid = studentPayments.reduce(function (sum, p) { return sum + (Number(p.amount) || 0); }, 0);
    var balance = totalCharges - totalPaid;

    return {
      studentId: student.id,
      student: student,
      plans: plans,
      charges: charges,
      history: history,
      payments: studentPayments,
      totalCharges: totalCharges,
      totalPaid: totalPaid,
      balance: balance,
      status: balance > 0 ? 'owes' : balance < 0 ? 'credit' : 'paid',
      attendance: overall,
      termProgress: termProgressMap
    };
  }

  function computeAll(data, options) {
    var today = (options && options.today) || Jalali.todayISO();
    var students = data.students || [];
    var byId = {};
    var list = students.map(function (student) {
      var summary = computeStudent(data, student, today);
      byId[student.id] = summary;
      return summary;
    });
    var totals = {
      charges: list.reduce(function (s, x) { return s + x.totalCharges; }, 0),
      paid: list.reduce(function (s, x) { return s + x.totalPaid; }, 0),
      balance: list.reduce(function (s, x) { return s + x.balance; }, 0),
      owes: list.filter(function (x) { return x.balance > 0 && !x.student.archived; }).length
    };
    return { list: list, byId: byId, totals: totals, today: today };
  }

  return {
    computeAll: computeAll,
    computeStudent: computeStudent,
    activeEnrollmentsAt: activeEnrollmentsAt,
    activeCountAt: activeCountAt,
    isEnrolled: isEnrolled,
    classFeeAt: classFeeAt,
    classShareAt: classShareAt,
    privateFeeAt: privateFeeAt,
    planActive: planActive,
    round: round
  };
});
