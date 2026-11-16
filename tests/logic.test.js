const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Jalali = require('../jalali.js');
const Fmt = require('../format.js');
const Billing = require('../billing.js');
const Portal = require('../portal.js');

const now = '2026-11-16T10:00:00.000Z';

function student(id, extra) {
  return Object.assign({
    id,
    name: 'Student ' + id,
    phone: '',
    type: 'group',
    level: '',
    notes: '',
    archived: false,
    createdAt: now,
    updatedAt: now
  }, extra || {});
}

function cls(id, extra) {
  return Object.assign({
    id,
    name: 'Class ' + id,
    level: '',
    type: 'group',
    schedule: [],
    priceModel: 'term',
    totalFee: 1000000,
    feeHistory: [{ effectiveFrom: '2000-01-01', totalFee: 1000000 }],
    termSize: 10,
    archived: false,
    createdAt: now,
    updatedAt: now
  }, extra || {});
}

function enrollment(id, classId, studentId, startDate, endDate) {
  return {
    id,
    classId,
    studentId,
    startDate,
    endDate: endDate || null,
    createdAt: now,
    updatedAt: now
  };
}

function session(id, date, extra) {
  return Object.assign({
    id,
    ownerType: 'class',
    classId: null,
    studentId: null,
    date,
    sessionKey: id,
    canceled: 'none',
    cancelReason: '',
    createdAt: now,
    updatedAt: now
  }, extra || {});
}

function attendance(sessionId, studentId, status) {
  return {
    id: sessionId + '-' + studentId,
    sessionId,
    studentId,
    status,
    createdAt: now,
    updatedAt: now
  };
}

function blankData() {
  return {
    students: [],
    classes: [],
    enrollments: [],
    sessions: [],
    attendance: [],
    grades: [],
    payments: [],
    notes: []
  };
}

function classData(options) {
  const data = blankData();
  const c = cls(options.classId || 'c1', options.classExtra || {});
  const s1 = student(options.studentId || 's1');
  const s2 = student(options.studentId2 || 's2');
  data.students.push(s1, s2);
  data.classes.push(c);
  data.enrollments.push(
    enrollment('e1', c.id, s1.id, options.start1 || '2026-01-01', options.end1),
    enrollment('e2', c.id, s2.id, options.start2 || '2026-01-01', options.end2)
  );
  return { data, c, s1, s2 };
}

function addSessions(data, dates, status1, status2, extra) {
  dates.forEach(function (date, index) {
    const id = 's' + String(index + 1);
    const rec = session(id, date, Object.assign({ classId: 'c1' }, extra || {}));
    data.sessions.push(rec);
    if (status1) data.attendance.push(attendance(id, 's1', status1));
    if (status2) data.attendance.push(attendance(id, 's2', status2));
  });
}

test('Jalali conversion and date helpers', function () {
  assert.deepEqual(Jalali.gToJ('2024-03-20'), { jy: 1403, jm: 1, jd: 1 });
  assert.equal(Jalali.jToG(1403, 1, 1), '2024-03-20');
  assert.equal(Jalali.jToG(1405, 1, 1), '2026-03-21');
  assert.equal(Jalali.isValidISO('2024-02-29'), true);
  assert.equal(Jalali.isValidISO('2023-02-29'), false);
  assert.equal(Jalali.weekdaySat0('2026-11-16'), 2);
  assert.equal(Jalali.jMonthKey('2026-11-16'), '1405-08');
  assert.equal(Jalali.jMonthKeyFrom(1405, 8), '1405-08');
  assert.deepEqual(Jalali.parseJMonthKey('1405-08'), { jy: 1405, jm: 8 });
  assert.equal(Jalali.addDays('2026-03-20', 1), '2026-03-21');
  assert.deepEqual(Jalali.addJMonths(1405, 12, 1), { jy: 1406, jm: 1 });
  assert.equal(Jalali.jMonthLength(1403, 12), 30);
  assert.equal(Jalali.isLeapJ(1403), true);
});

test('Persian formatting and amount parsing', function () {
  assert.equal(Fmt.toFaDigits('1405'), '۱۴۰۵');
  assert.equal(Fmt.toEnDigits('۱۴۰۵'), '1405');
  assert.equal(Fmt.formatNumber(1500000, 'fa'), '۱,۵۰۰,۰۰۰');
  assert.equal(Fmt.formatNumber(1500000, 'en'), '1,500,000');
  assert.equal(Fmt.formatNumber(1.5, 'fa'), '۱٫۵');
  assert.equal(Fmt.formatNumber(1.5, 'en'), '1.5');
  assert.equal(Fmt.formatMoney(1500000, 'fa'), '۱,۵۰۰,۰۰۰ تومان');
  assert.equal(Fmt.formatMoney(1500000, 'en'), '1,500,000 Toman');
  assert.equal(Fmt.formatPercent(67, 'fa'), '۶۷٪');
  assert.equal(Fmt.formatScore(18.456, 'fa'), '۱۸٫۴۶');
  assert.equal(Fmt.parseAmount('۱٬۵۰۰٬۰۰۰ تومان'), 1500000);
  assert.equal(Fmt.parseAmount('1,500,000 Toman'), 1500000);
  assert.equal(Fmt.parseAmount('bad'), null);
  assert.equal(Fmt.formatDate('2024-03-20', 'fa'), '۱ فروردین ۱۴۰۳');
  assert.equal(Fmt.formatDate('2024-03-20', 'en'), '1 Farvardin 1403');
  assert.equal(Fmt.formatDate('2024-03-20', 'fa', 'short'), '۱۴۰۳/۰۱/۰۱');
  assert.equal(Fmt.formatMonthKey('1405-08', 'fa'), 'آبان ۱۴۰۵');
});

test('term billing charges every ten counted sessions and counts absences', function () {
  const fixture = classData({});
  const dates = Array.from({ length: 11 }, function (_, i) { return '2026-01-' + String(i + 1).padStart(2, '0'); });
  addSessions(fixture.data, dates, 'present', 'absent');
  const summary = Billing.computeStudent(fixture.data, fixture.s1, '2026-01-20');
  assert.equal(summary.plans.length, 1);
  assert.equal(summary.plans[0].charges.length, 2);
  assert.deepEqual(summary.plans[0].charges.map(function (c) { return c.amount; }), [500000, 500000]);
  assert.equal(summary.plans[0].termProgress.counted, 11);
  assert.equal(summary.plans[0].termProgress.termNumber, 2);
  assert.equal(summary.plans[0].termProgress.inTerm, 1);
  assert.equal(summary.attendance.normal, 11);
  assert.equal(summary.attendance.absent, 0);
  assert.equal(summary.attendance.percentage, 100);
  assert.equal(summary.totalCharges, 1000000);
  assert.equal(summary.balance, 1000000);
  assert.equal(summary.status, 'owes');
});

test('per-session billing charges present, late and counted cancellations only', function () {
  const fixture = classData({
    classExtra: {
      priceModel: 'session',
      totalFee: 300000,
      feeHistory: [{ effectiveFrom: '2000-01-01', totalFee: 300000 }]
    }
  });
  const dates = ['2026-02-01', '2026-02-02', '2026-02-03', '2026-02-04', '2026-02-05'];
  addSessions(fixture.data, dates.slice(0, 3), 'present', 'present');
  fixture.data.attendance.find(function (a) { return a.sessionId === 's2' && a.studentId === 's1'; }).status = 'late';
  fixture.data.attendance.find(function (a) { return a.sessionId === 's3' && a.studentId === 's1'; }).status = 'absent';
  fixture.data.sessions.push(
    session('s4', '2026-02-04', { classId: 'c1', canceled: 'counted' }),
    session('s5', '2026-02-05', { classId: 'c1', canceled: 'makeup' })
  );
  const summary = Billing.computeStudent(fixture.data, fixture.s1, '2026-02-10');
  assert.equal(summary.plans[0].charges.length, 3);
  assert.equal(summary.totalCharges, 450000);
  assert.equal(summary.attendance.present, 1);
  assert.equal(summary.attendance.late, 1);
  assert.equal(summary.attendance.absent, 1);
  assert.equal(summary.attendance.percentage, 67);
  assert.equal(summary.attendance.canceledCounted, 1);
  assert.equal(summary.attendance.canceledMakeup, 1);
  assert.equal(summary.attendance.canceledTotal, 2);
  assert.equal(summary.history.length, 5);
});

test('monthly billing charges once per Jalali month and ignores makeup cancellations', function () {
  const fixture = classData({
    classExtra: {
      priceModel: 'month',
      totalFee: 600000,
      feeHistory: [{ effectiveFrom: '2000-01-01', totalFee: 600000 }]
    }
  });
  fixture.data.sessions.push(
    session('s1', '2026-04-01', { classId: 'c1' }),
    session('s2', '2026-04-15', { classId: 'c1' }),
    session('s3', '2026-05-01', { classId: 'c1', canceled: 'counted' }),
    session('s4', '2026-05-20', { classId: 'c1', canceled: 'makeup' }),
    session('s5', '2026-06-01', { classId: 'c1' })
  );
  fixture.data.attendance.push(
    attendance('s1', 's1', 'present'),
    attendance('s2', 's1', 'absent'),
    attendance('s5', 's1', 'present'),
    attendance('s1', 's2', 'present'),
    attendance('s2', 's2', 'present'),
    attendance('s5', 's2', 'present')
  );
  const summary = Billing.computeStudent(fixture.data, fixture.s1, '2026-06-10');
  assert.equal(summary.plans[0].charges.length, 3);
  assert.deepEqual(summary.plans[0].charges.map(function (c) { return c.monthKey; }), ['1405-01', '1405-02', '1405-03']);
  assert.equal(summary.totalCharges, 900000);
  assert.equal(summary.attendance.normal, 3);
  assert.equal(summary.attendance.attended, 2);
  assert.equal(summary.attendance.percentage, 67);
  assert.equal(summary.attendance.canceledCounted, 1);
  assert.equal(summary.attendance.canceledMakeup, 1);
});

test('class share is frozen by the active roster on each charge date', function () {
  const fixture = classData({
    classExtra: {
      totalFee: 900000,
      feeHistory: [{ effectiveFrom: '2000-01-01', totalFee: 900000 }]
    },
    end2: '2026-01-05'
  });
  const dates = Array.from({ length: 12 }, function (_, i) { return '2026-01-' + String(i + 1).padStart(2, '0'); });
  addSessions(fixture.data, dates, 'present', null);
  dates.slice(0, 5).forEach(function (_, i) {
    fixture.data.attendance.push(attendance('s' + (i + 1), 's2', 'present'));
  });
  assert.equal(Billing.classShareAt(fixture.c, fixture.data.enrollments, '2026-01-01'), 450000);
  assert.equal(Billing.classShareAt(fixture.c, fixture.data.enrollments, '2026-01-11'), 900000);
  const s1 = Billing.computeStudent(fixture.data, fixture.s1, '2026-01-20');
  const s2 = Billing.computeStudent(fixture.data, fixture.s2, '2026-01-20');
  assert.deepEqual(s1.plans[0].charges.map(function (c) { return c.amount; }), [450000, 900000]);
  assert.equal(s1.totalCharges, 1350000);
  assert.equal(s2.totalCharges, 450000);
  assert.equal(s2.plans[0].termProgress.counted, 5);
});

test('rejoining a class creates a distinct plan and preserves both histories', function () {
  const fixture = classData({
    classExtra: {
      totalFee: 1000000,
      feeHistory: [{ effectiveFrom: '2000-01-01', totalFee: 1000000 }]
    },
    end1: '2026-01-31',
    start2: '2026-02-01'
  });
  fixture.data.enrollments[1].studentId = 's1';
  fixture.data.enrollments[1].startDate = '2026-02-01';
  fixture.data.sessions.push(
    session('s1', '2026-01-15', { classId: 'c1' }),
    session('s2', '2026-02-15', { classId: 'c1' })
  );
  fixture.data.attendance.push(
    attendance('s1', 's1', 'present'),
    attendance('s2', 's1', 'present')
  );
  const summary = Billing.computeStudent(fixture.data, fixture.s1, '2026-02-20');
  assert.equal(summary.plans.length, 2);
  assert.notEqual(summary.plans[0].key, summary.plans[1].key);
  assert.equal(summary.totalCharges, 2000000);
  assert.equal(summary.plans[0].active, false);
  assert.equal(summary.plans[1].active, true);
  assert.equal(summary.attendance.normal, 2);
});

test('class fee history applies the fee effective on each term start', function () {
  const fixture = classData({
    classExtra: {
      totalFee: 2000000,
      feeHistory: [
        { effectiveFrom: '2026-01-01', totalFee: 1000000 },
        { effectiveFrom: '2026-01-11', totalFee: 2000000 }
      ]
    }
  });
  const dates = Array.from({ length: 11 }, function (_, i) { return '2026-01-' + String(i + 1).padStart(2, '0'); });
  addSessions(fixture.data, dates, 'present', 'present');
  const summary = Billing.computeStudent(fixture.data, fixture.s1, '2026-01-20');
  assert.deepEqual(summary.plans[0].charges.map(function (c) { return c.amount; }), [500000, 1000000]);
  assert.equal(summary.totalCharges, 1500000);
});

test('private term, per-session and ended-plan billing', function () {
  const termStudent = student('p1', {
    type: 'private',
    privatePlan: {
      model: 'term',
      fee: 1000000,
      feeHistory: [{ effectiveFrom: '2026-01-01', fee: 1000000 }],
      startDate: '2026-01-01',
      endDate: null,
      termSize: 10
    }
  });
  const data = blankData();
  data.students.push(termStudent);
  for (let i = 0; i < 11; i++) {
    const id = 'p' + i;
    const date = '2026-01-' + String(i + 1).padStart(2, '0');
    data.sessions.push(session(id, date, { ownerType: 'private', classId: null, studentId: 'p1' }));
    data.attendance.push(attendance(id, 'p1', i === 2 ? 'absent' : 'present'));
  }
  const summary = Billing.computeStudent(data, termStudent, '2026-01-20');
  assert.equal(summary.totalCharges, 2000000);
  assert.equal(summary.plans[0].termProgress.counted, 11);
  assert.equal(summary.attendance.normal, 11);
  assert.equal(summary.attendance.attended, 10);
  assert.equal(summary.attendance.percentage, 91);

  const sessionStudent = student('p2', {
    type: 'private',
    privatePlan: {
      model: 'session',
      fee: 200000,
      feeHistory: [{ effectiveFrom: '2026-01-01', fee: 200000 }],
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      termSize: 10
    }
  });
  const sessionData = blankData();
  sessionData.students.push(sessionStudent);
  const statuses = ['present', 'late', 'absent'];
  statuses.forEach(function (status, i) {
    const id = 'x' + i;
    sessionData.sessions.push(session(id, '2026-01-' + String(i + 1).padStart(2, '0'), { ownerType: 'private', classId: null, studentId: 'p2' }));
    sessionData.attendance.push(attendance(id, 'p2', status));
  });
  sessionData.sessions.push(
    session('x3', '2026-01-04', { ownerType: 'private', classId: null, studentId: 'p2', canceled: 'counted' }),
    session('x4', '2026-01-05', { ownerType: 'private', classId: null, studentId: 'p2', canceled: 'makeup' }),
    session('x5', '2026-02-01', { ownerType: 'private', classId: null, studentId: 'p2' })
  );
  sessionData.attendance.push(attendance('x5', 'p2', 'present'));
  const sessionSummary = Billing.computeStudent(sessionData, sessionStudent, '2026-02-10');
  assert.equal(sessionSummary.totalCharges, 600000);
  assert.equal(sessionSummary.plans[0].active, false);
  assert.equal(sessionSummary.attendance.normal, 3);
  assert.equal(sessionSummary.attendance.canceledCounted, 1);
  assert.equal(sessionSummary.attendance.canceledMakeup, 1);
});

test('private sessions without a plan are tracked but never charged', function () {
  const s = student('p3', { type: 'private' });
  const data = blankData();
  data.students.push(s);
  data.sessions.push(
    session('z1', '2026-01-01', { ownerType: 'private', classId: null, studentId: 'p3' }),
    session('z2', '2026-01-02', { ownerType: 'private', classId: null, studentId: 'p3' })
  );
  data.attendance.push(attendance('z1', 'p3', 'present'), attendance('z2', 'p3', 'absent'));
  const summary = Billing.computeStudent(data, s, '2026-01-10');
  assert.equal(summary.totalCharges, 0);
  assert.equal(summary.plans[0].billingEnabled, false);
  assert.equal(summary.attendance.normal, 2);
});

test('payments are pooled per student and compute credit or paid status', function () {
  const fixture = classData({});
  const dates = Array.from({ length: 10 }, function (_, i) { return '2026-01-' + String(i + 1).padStart(2, '0'); });
  addSessions(fixture.data, dates, 'present', 'present');
  fixture.data.payments.push(
    { id: 'pay1', studentId: 's1', amount: 400000, date: '2026-01-10', createdAt: now, updatedAt: now }
  );
  const owes = Billing.computeStudent(fixture.data, fixture.s1, '2026-01-20');
  assert.equal(owes.totalCharges, 500000);
  assert.equal(owes.totalPaid, 400000);
  assert.equal(owes.balance, 100000);
  assert.equal(owes.status, 'owes');
  fixture.data.payments.push(
    { id: 'pay2', studentId: 's1', amount: 100000, date: '2026-01-11', createdAt: now, updatedAt: now }
  );
  const paid = Billing.computeStudent(fixture.data, fixture.s1, '2026-01-20');
  assert.equal(paid.balance, 0);
  assert.equal(paid.status, 'paid');
  fixture.data.payments.push(
    { id: 'pay3', studentId: 's1', amount: 100000, date: '2026-01-12', createdAt: now, updatedAt: now }
  );
  const credit = Billing.computeStudent(fixture.data, fixture.s1, '2026-01-20');
  assert.equal(credit.balance, -100000);
  assert.equal(credit.status, 'credit');
  assert.equal(credit.payments.length, 3);
});

test('backup validation rejects bad versions, duplicates and broken references', function () {
  const source = fs.readFileSync(path.join(__dirname, '..', 'db.js'), 'utf8');
  const context = { console: console, Jalali: Jalali };
  vm.createContext(context);
  vm.runInContext(source, context);
  const DB = context.DB;
  const valid = {
    schemaVersion: 1,
    data: {
      students: [{ id: 's1', name: 'S' }],
      classes: [{ id: 'c1', name: 'C', priceModel: 'term' }],
      enrollments: [{ id: 'e1', classId: 'c1', studentId: 's1', startDate: '2026-01-01' }],
      sessions: [{ id: 'x1', ownerType: 'class', classId: 'c1', date: '2026-01-02', sessionKey: 'class:c1:2026-01-02', canceled: 'none' }],
      attendance: [{ id: 'a1', sessionId: 'x1', studentId: 's1', status: 'present' }],
      grades: [{ id: 'g1', studentId: 's1', date: '2026-01-03' }],
      payments: [{ id: 'p1', studentId: 's1', date: '2026-01-04', amount: 1000 }],
      notes: [{ id: 'n1', classId: 'c1', date: '2026-01-05' }]
    }
  };
  assert.equal(DB.validateBackup(valid).ok, true);
  const v2 = JSON.parse(JSON.stringify(valid));
  v2.schemaVersion = 2;
  v2.data.proofs = [{ id: 'pr1', studentId: 's1', date: '2026-01-06', amount: 1000, status: 'pending' }];
  assert.equal(DB.validateBackup(v2).ok, true);
  assert.equal(DB.validateBackup(Object.assign({}, valid, { schemaVersion: 3 })).error, 'version');
  const broken = JSON.parse(JSON.stringify(valid));
  broken.data.attendance[0].sessionId = 'missing';
  assert.equal(DB.validateBackup(broken).ok, false);
  const duplicate = JSON.parse(JSON.stringify(valid));
  duplicate.data.students.push({ id: 's1', name: 'Duplicate' });
  assert.equal(DB.validateBackup(duplicate).ok, false);
  assert.equal(DB.sessionKey('class', 'c1', null, '2026-01-01'), 'class:c1:2026-01-01');
  assert.equal(DB.sessionKey('private', null, 's1', '2026-01-01'), 'private:s1:2026-01-01');
});

test('student portal exposes only the student own visible data', function () {
  const fixture = classData({});
  addSessions(fixture.data, ['2026-01-02', '2026-01-03'], 'present', 'absent');
  fixture.data.notes.push(
    { id: 'n1', studentId: 's1', date: '2026-01-04', title: 'Visible', body: 'A', visibleToStudent: true },
    { id: 'n2', studentId: 's1', date: '2026-01-05', title: 'Private', body: 'B', visibleToStudent: false },
    { id: 'n3', classId: 'c1', date: '2026-01-06', title: 'Class', body: 'C', visibleToStudent: true },
    { id: 'n4', studentId: 's2', date: '2026-01-07', title: 'Other', body: 'D', visibleToStudent: true }
  );
  fixture.data.proofs = [
    { id: 'pr1', studentId: 's1', date: '2026-01-08', amount: 1000, status: 'pending', submittedAt: now },
    { id: 'pr2', studentId: 's2', date: '2026-01-09', amount: 2000, status: 'approved', submittedAt: now }
  ];
  const summary = Billing.computeStudent(fixture.data, fixture.s1, '2026-01-20');
  const portal = Portal.buildStudentPortal(fixture.data, fixture.s1, summary, { teacherName: 'Teacher', now: now });
  assert.equal(portal.app, 'my-class-portal');
  assert.equal(portal.studentId, 's1');
  assert.equal(portal.teacherName, 'Teacher');
  assert.deepEqual(portal.notes.map(function (note) { return note.id; }).sort(), ['n1', 'n3']);
  assert.equal(portal.proofs.length, 1);
  assert.equal(portal.proofs[0].id, 'pr1');
  assert.equal(Portal.validatePortal(portal).ok, true);
  assert.equal(Portal.validatePortal(portal, 's2').ok, false);
});

test('student inbox accepts image submissions and rejects mismatched students', function () {
  const inbox = Portal.emptyInbox('s1');
  const submission = Portal.makeSubmission({
    amount: 5000,
    date: '2026-01-10',
    note: 'Receipt',
    mime: 'image/jpeg',
    fileName: 'receipt.jpg',
    data: 'data:image/jpeg;base64,AAAA'
  });
  const next = Portal.appendSubmission(inbox, submission);
  const duplicate = Portal.appendSubmission(next, submission);
  assert.equal(next.submissions.length, 1);
  assert.equal(duplicate.submissions.length, 1);
  assert.equal(next.submissions[0].data, 'AAAA');
  assert.equal(Portal.validateInbox(next, 's1').ok, true);
  assert.equal(Portal.validateInbox(next, 's2').error, 'student');
  assert.equal(Portal.validateInbox(Object.assign({}, next, { schemaVersion: 2 })).error, 'version');
});
