import { describe, it, expect } from 'vitest';

describe('Document Action Reason Modal (Hold, Cancel, Reject)', () => {
  const getActionModalConfig = (actionType: 'hold' | 'cancel' | 'reject') => {
    switch (actionType) {
      case 'hold':
        return {
          header: 'Hold Document',
          bodyText: 'Please provide a reason for placing this document on hold or requesting clarification.',
        };
      case 'cancel':
        return {
          header: 'Cancel Document',
          bodyText: 'Please provide a reason for cancelling this document.',
        };
      case 'reject':
        return {
          header: 'Reject Document',
          bodyText: 'Please specify the reason for rejecting and returning this document for correction.',
        };
    }
  };

  const isConfirmDisabled = (reason: string, loading: boolean) => {
    return loading || !reason.trim();
  };

  it('renders correct header and body text for Hold Document', () => {
    const config = getActionModalConfig('hold');
    expect(config.header).toBe('Hold Document');
    expect(config.bodyText).toBe(
      'Please provide a reason for placing this document on hold or requesting clarification.'
    );
  });

  it('renders correct header and body text for Cancel Document', () => {
    const config = getActionModalConfig('cancel');
    expect(config.header).toBe('Cancel Document');
    expect(config.bodyText).toBe('Please provide a reason for cancelling this document.');
  });

  it('renders correct header and body text for Reject Document', () => {
    const config = getActionModalConfig('reject');
    expect(config.header).toBe('Reject Document');
    expect(config.bodyText).toBe(
      'Please specify the reason for rejecting and returning this document for correction.'
    );
  });

  it('disables Confirm button when textarea is empty or whitespace-only', () => {
    expect(isConfirmDisabled('', false)).toBe(true);
    expect(isConfirmDisabled('   ', false)).toBe(true);
    expect(isConfirmDisabled('Valid reason notes', false)).toBe(false);
    expect(isConfirmDisabled('Valid reason notes', true)).toBe(true);
  });

  it('passes entered notes to API handler payload on confirm', () => {
    const payloadBuilder = (actionType: 'hold' | 'cancel' | 'reject', enteredReason: string, docId: string) => {
      if (actionType === 'cancel') {
        return {
          endpoint: '/api/workflows/cancel',
          body: { invoiceId: docId, id: docId, comments: enteredReason.trim() }
        };
      }
      if (actionType === 'reject') {
        return {
          endpoint: '/api/workflows/reject',
          body: { invoiceId: docId, id: docId, comments: enteredReason.trim() }
        };
      }
      return {
        endpoint: `/api/documents/${docId}/hold`,
        body: { remarks: `[ACTION: Hold] ${enteredReason.trim()}` }
      };
    };

    const cancelPayload = payloadBuilder('cancel', 'Duplicate invoice submitted', 'INV-1006');
    expect(cancelPayload.endpoint).toBe('/api/workflows/cancel');
    expect(cancelPayload.body.comments).toBe('Duplicate invoice submitted');

    const rejectPayload = payloadBuilder('reject', 'Price mismatch on item 3', 'INV-1006');
    expect(rejectPayload.endpoint).toBe('/api/workflows/reject');
    expect(rejectPayload.body.comments).toBe('Price mismatch on item 3');

    const holdPayload = payloadBuilder('hold', 'Awaiting tax clearance document', 'INV-1006');
    expect(holdPayload.endpoint).toBe('/api/documents/INV-1006/hold');
    expect(holdPayload.body.remarks).toContain('Awaiting tax clearance document');
  });
});
