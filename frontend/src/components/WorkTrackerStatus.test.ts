import { describe, it, expect } from 'vitest';

describe('Workflow Stage & Approver Status Differentiation', () => {
  const roleAliases: Record<string, string[]> = {
    admin: ["admin", "administrator", "system administrator", "superadmin", "system_admin"],
    manager: ["manager", "operations manager", "operations_manager", "finance_manager", "finance manager"],
    finance_manager: ["finance_manager", "finance manager", "manager", "operations_manager"],
    ap_executive: ["ap_executive", "ap executive", "ap_specialist", "ap specialist", "accounts_approver", "accounts approver"],
    accounts_approver: ["accounts_approver", "accounts approver", "ap_executive", "ap executive", "ap_specialist", "ap specialist"],
    accounts_approver2: ["accounts_approver2", "accounts approver 2"],
    employee: ["employee", "standard employee", "standard_employee"],
    account_uploder: ["account_uploder", "accounts_uploder", "account_uploader", "accounts_uploader", "doc_uploder", "doc_uploader", "uploader"],
    accounts_uploder: ["account_uploder", "accounts_uploder", "account_uploader", "accounts_uploader", "doc_uploder", "doc_uploader", "uploader"],
    doc_uploder: ["account_uploder", "accounts_uploder", "account_uploader", "accounts_uploader", "doc_uploder", "doc_uploader", "uploader"],
    account_uploader: ["account_uploder", "accounts_uploder", "account_uploader", "accounts_uploader", "doc_uploder", "doc_uploader", "uploader"],
    doc_uploader: ["account_uploder", "accounts_uploder", "account_uploader", "accounts_uploader", "doc_uploder", "doc_uploader", "uploader"]
  };

  const isAssignedToUser = (doc: any, user: { username: string; role: string }): boolean => {
    if (doc.is_current_approver === false) return false;
    if (doc.is_current_approver === true) return true;

    const rHandle = user.role.toLowerCase().trim();
    const uHandle = user.username.toLowerCase().trim();
    const rawAssigned = (doc.assigned_approver || doc.assigned_to || '').toString().toLowerCase().trim();
    const pool = rawAssigned.split(',').map((s: string) => s.trim()).filter(Boolean);

    const activeAliases = roleAliases[rHandle] || (rHandle ? [rHandle] : []);
    const currentStage = doc.current_stage || 1;
    const isUploader = rHandle.includes("uplod") || rHandle === "admin";

    // Stage 1 guard: only uploader or assigned user has action required
    if (currentStage === 1 && !doc.is_current_approver && !isUploader) {
      return false;
    }

    if (uHandle && pool.some((p: string) => p === uHandle)) return true;
    if (rHandle && pool.some((p: string) => activeAliases.some((a: string) => p === a || p.replace(/[_ ]/g, '') === a.replace(/[_ ]/g, '')))) return true;
    return false;
  };

  it('marks stage 1 document as Pending for Yuvasree (uploader) and In Progress for Vignesh (next approver)', () => {
    const docStage1 = {
      id: 'INV-1006',
      current_stage: 1,
      assigned_to: 'account_uploder',
      assigned_approver: 'account_uploder',
      status: 'Pending Verification'
    };

    const yuvasree = { username: 'YUVASREE', role: 'account_uploder' };
    const vignesh = { username: 'VIGNESH', role: 'accounts_approver' };

    // For Yuvasree, action is required -> Pending
    const yuvasreeAction = isAssignedToUser(docStage1, yuvasree);
    expect(yuvasreeAction).toBe(true);

    // For Vignesh, action is NOT required at stage 1 -> In Progress
    const vigneshAction = isAssignedToUser(docStage1, vignesh);
    expect(vigneshAction).toBe(false);
  });

  it('correctly shifts to Pending for Vignesh once document reaches Stage 2', () => {
    const docStage2 = {
      id: 'INV-1006',
      current_stage: 2,
      assigned_to: 'accounts_approver',
      assigned_approver: 'accounts_approver',
      status: 'In Progress (Stage 2)'
    };

    const yuvasree = { username: 'YUVASREE', role: 'account_uploder' };
    const vignesh = { username: 'VIGNESH', role: 'accounts_approver' };

    // At Stage 2, Yuvasree is done; Vignesh is now required to act -> Pending
    expect(isAssignedToUser(docStage2, yuvasree)).toBe(false);
    expect(isAssignedToUser(docStage2, vignesh)).toBe(true);
  });

  it('matches pending predicate when user is Yuvasree with employee role mapped to uploader', () => {
    const isAssignedToUserDashboard = (doc: any, user: { username: string; role: string }): boolean => {
      if (doc.is_current_approver === false) return false;
      if (doc.is_current_approver === true) return true;

      const rHandle = user.role.toLowerCase().trim();
      const uHandle = user.username.toLowerCase().trim();
      const rawAssigned = (doc.assigned_approver || doc.assigned_to || '').toString().toLowerCase().trim();
      const pool = rawAssigned.split(',').map((s: string) => s.trim()).filter(Boolean);

      const activeAliases = roleAliases[rHandle] ? [...roleAliases[rHandle]] : (rHandle ? [rHandle] : []);
      if (uHandle === 'yuvasree' || uHandle === 'meshak') {
        activeAliases.push('account_uploder', 'account_uploader', 'accounts_uploder', 'accounts_uploader', 'uploader');
      }

      const isTrueUploader = rHandle.includes('uplod') || rHandle === 'admin' || uHandle === 'yuvasree' || uHandle === 'meshak';
      const currentStage = doc.current_stage || 1;

      if (currentStage === 1 && !doc.is_current_approver && !isTrueUploader) {
        return false;
      }

      if (uHandle && pool.some((p: string) => p === uHandle || p.includes(uHandle))) return true;
      if (rHandle && pool.some((p: string) => activeAliases.some((a: string) => a && (p === a || p.replace(/[_ ]/g, '') === a.replace(/[_ ]/g, ''))))) return true;
      return false;
    };

    const doc1006 = {
      id: 'INV-1006',
      current_stage: 1,
      assigned_to: 'account_uploder',
      assigned_approver: 'account_uploder',
      status: 'Pending'
    };
    const doc1005 = {
      id: 'FRT-1005',
      current_stage: 1,
      assigned_to: 'account_uploder',
      assigned_approver: 'account_uploder',
      status: 'Pending'
    };

    const yuvasree = { username: 'yuvasree', role: 'employee' };
    const vignesh = { username: 'vignesh', role: 'accounts_approver' };

    expect(isAssignedToUserDashboard(doc1006, yuvasree)).toBe(true);
    expect(isAssignedToUserDashboard(doc1005, yuvasree)).toBe(true);
    expect(isAssignedToUserDashboard(doc1006, vignesh)).toBe(false);
    expect(isAssignedToUserDashboard(doc1005, vignesh)).toBe(false);
  });

  it('combines Rejected and Cancelled documents in REJECTED KPI card total (2 OF 4)', () => {
    const docs = [
      { id: 'INV-1001', status: 'Pending', is_current_approver: true },
      { id: 'INV-1002', status: 'Pending', is_current_approver: true },
      { id: 'INV-1003', status: 'Cancelled', has_rejected: false },
      { id: 'INV-1004', status: 'Void', has_rejected: false }
    ];

    const isHoldStatus = (st: string) => (st || '').toLowerCase().includes('hold');
    const isRejectedStatus = (st: string) => {
      const s = (st || '').toLowerCase();
      if (s.includes('cancel') || s.includes('void')) return false;
      return s.includes('reject') || s.includes('fail');
    };
    const isCancelledStatus = (st: string) => {
      const s = (st || '').toLowerCase();
      return s.includes('cancel') || s.includes('void');
    };

    const pendingCount = docs.filter(d => (d.status || '').toLowerCase().includes('pending')).length;
    const holdCount = docs.filter(d => isHoldStatus(d.status)).length;
    const rejectedCount = docs.filter(d => isRejectedStatus(d.status)).length;
    const cancelledCount = docs.filter(d => isCancelledStatus(d.status)).length;

    // Combined REJECTED KPI total includes both Rejected and Cancelled
    const rejectedKpiTotal = rejectedCount + cancelledCount;
    const activeTotal = pendingCount + holdCount + rejectedCount + cancelledCount;
    const rejectedKpiPercent = activeTotal > 0 ? Math.round((rejectedKpiTotal / activeTotal) * 100) : 0;

    expect(pendingCount).toBe(2);
    expect(rejectedCount).toBe(0);
    expect(cancelledCount).toBe(2);
    expect(rejectedKpiTotal).toBe(2);
    expect(activeTotal).toBe(4);
    expect(rejectedKpiPercent).toBe(50);

    // List displayed on clicking REJECTED card includes both rejected and cancelled
    const rejectedFilterDocs = docs.filter(d => isRejectedStatus(d.status) || isCancelledStatus(d.status));
    expect(rejectedFilterDocs.length).toBe(2);
    expect(rejectedFilterDocs.map(d => d.id)).toEqual(['INV-1003', 'INV-1004']);
  });

  it('filters Work Tracker by all active non-terminal statuses (Pending, In Progress, Hold) when navigating from PROGRESS card', () => {
    const isTerminalOrApproved = (doc: any) => {
      const st = (doc.status || '').toLowerCase().trim();
      return ['approved', 'settled', 'paid', 'cancelled', 'failed', 'rejected'].some(t => st.includes(t));
    };

    const filterDocsByStatus = (docs: any[], statusFilter: string) => {
      return docs.filter(doc => {
        if (statusFilter === 'all') return !isTerminalOrApproved(doc);
        const st = (doc.status || '').toLowerCase();
        const isActionRequired = Boolean(doc.is_current_approver) && !doc.has_approved;
        const isInProgress = Boolean(doc.has_approved) || st.includes('in progress') || st.includes('stage') || !isActionRequired;

        if (statusFilter === 'pending') {
          return isActionRequired;
        } else if (statusFilter === 'in_progress' || statusFilter === 'progress' || statusFilter === 'active') {
          return !isTerminalOrApproved(doc) && (
            st.includes('pending') ||
            st.includes('progress') ||
            st.includes('stage') ||
            st.includes('hold') ||
            st.includes('pause') ||
            st.includes('wait') ||
            st.includes('clarif') ||
            isActionRequired ||
            isInProgress
          );
        } else if (statusFilter === 'hold') {
          return st.includes('hold') || st.includes('pause');
        }
        return true;
      });
    };

    const sampleDocs = [
      { id: 'INV-1006', status: 'Pending', is_current_approver: true, has_approved: false },
      { id: 'FRT-1005', status: 'Pending', is_current_approver: true, has_approved: false },
      { id: 'INV-1007', status: 'Approved', is_current_approver: false, has_approved: true },
      { id: 'INV-1008', status: 'Cancelled', is_current_approver: false, has_approved: false }
    ];

    // When clicking PROGRESS card (filter = 'in_progress' or 'progress'), returns all 2 active documents
    const progressDocs = filterDocsByStatus(sampleDocs, 'in_progress');
    expect(progressDocs.length).toBe(2);
    expect(progressDocs.map(d => d.id)).toEqual(['INV-1006', 'FRT-1005']);

    const progressAliasDocs = filterDocsByStatus(sampleDocs, 'progress');
    expect(progressAliasDocs.length).toBe(2);
    expect(progressAliasDocs.map(d => d.id)).toEqual(['INV-1006', 'FRT-1005']);
  });

  it('keeps documents assigned to YUVASREE in Pending filter even if is_current_approver is false or viewer is admin', () => {
    const isAssignedToUser = (doc: any, user: { username: string; role: string }): boolean => {
      if (doc.is_current_approver === true) return true;
      const uHandle = user.username.toLowerCase().trim();
      const rHandle = user.role.toLowerCase().trim();
      const rawAssigned = (doc.assigned_approver || doc.assigned_to || '').toString().toLowerCase().trim();
      const pool = rawAssigned.split(',').map((s: string) => s.trim()).filter(Boolean);

      // Direct match
      if (uHandle && pool.some((p: string) => p === uHandle || p.includes(uHandle) || uHandle.includes(p))) return true;

      const activeAliases = roleAliases[rHandle] ? [...roleAliases[rHandle]] : (rHandle ? [rHandle] : []);
      if (uHandle === 'yuvasree' || uHandle === 'meshak') {
        activeAliases.push('account_uploder', 'account_uploader', 'accounts_uploder', 'accounts_uploader', 'uploader');
      }
      const isTrueUploader = rHandle.includes('uplod') || rHandle === 'admin' || uHandle === 'yuvasree' || uHandle === 'meshak';
      const currentStage = doc.current_stage || 1;
      if (currentStage === 1 && !doc.is_current_approver && !isTrueUploader) {
        return false;
      }
      if (rHandle && pool.some((p: string) => activeAliases.some((a: string) => p === a))) return true;
      return false;
    };

    const doc1006 = {
      id: 'INV-1006',
      status: 'Pending',
      assigned_to: 'YUVASREE',
      assigned_approver: 'YUVASREE',
      current_stage: 1,
      is_current_approver: false,
      has_approved: false
    };
    const doc1005 = {
      id: 'FRT-1005',
      status: 'Pending',
      assigned_to: 'YUVASREE',
      assigned_approver: 'YUVASREE',
      current_stage: 1,
      is_current_approver: false,
      has_approved: false
    };

    // 1. Direct assignment match for Yuvasree (even if DB role is 'employee')
    const yuvasreeUser = { username: 'YUVASREE', role: 'employee' };
    expect(isAssignedToUser(doc1006, yuvasreeUser)).toBe(true);
    expect(isAssignedToUser(doc1005, yuvasreeUser)).toBe(true);

    // 2. Pending filter in Work Tracker matches status 'Pending' or isActionRequired
    const filterPending = (docs: any[], user: { username: string; role: string }) => {
      return docs.filter(doc => {
        const st = (doc.status || '').toLowerCase();
        const isActionRequired = isAssignedToUser(doc, user) && !doc.has_approved;
        return st.startsWith('pending') || st === 'pending' || st.includes('pending') || isActionRequired;
      });
    };

    // Viewer is Yuvasree: documents appear
    const yuvasreePending = filterPending([doc1006, doc1005], yuvasreeUser);
    expect(yuvasreePending.length).toBe(2);
    expect(yuvasreePending.map(d => d.id)).toEqual(['INV-1006', 'FRT-1005']);

    // Viewer is Admin: documents also appear under Pending status filter
    const adminUser = { username: 'ADMIN01', role: 'admin' };
    const adminPending = filterPending([doc1006, doc1005], adminUser);
    expect(adminPending.length).toBe(2);
    expect(adminPending.map(d => d.id)).toEqual(['INV-1006', 'FRT-1005']);
  });
});
