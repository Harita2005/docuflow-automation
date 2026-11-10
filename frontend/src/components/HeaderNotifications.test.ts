import { describe, it, expect, vi } from "vitest";

// Replicate the exact logic implemented in Header.tsx
const isActionRequiredNotification = (n: any) => {
  const type = (n.notification_type || "").toUpperCase();
  const title = (n.title || "").toLowerCase();
  if (type === "PENDING_APPROVAL" || type === "SENT_BACK" || type === "ASSIGNED") {
    if (title.startsWith("approval confirmed") || title.startsWith("returned to previous stage")) {
      return false;
    }
    return true;
  }
  if (title.startsWith("action required")) {
    return true;
  }
  return false;
};

const handleNotificationItemClick = (
  n: any,
  onViewDocument: ((id: string) => void) | undefined,
  handleMarkAsRead: (id: string) => void,
  setPopoverOpen: (open: boolean) => void
) => {
  if (!n.is_read) {
    handleMarkAsRead(n.notification_id);
  }

  if (isActionRequiredNotification(n)) {
    if (onViewDocument && n.document_id) {
      onViewDocument(n.document_id);
    }
    setPopoverOpen(false);
  }
};

describe("Notification Center Click & Classification Behavior", () => {
  it("Scenario 1: Action Required (PENDING_APPROVAL) marks read and redirects", () => {
    const onViewDocument = vi.fn();
    const handleMarkAsRead = vi.fn();
    const setPopoverOpen = vi.fn();

    const notif = {
      notification_id: "NOTIF-01",
      document_id: "INV-101",
      notification_type: "PENDING_APPROVAL",
      title: "Action Required: INV-101 Assigned to You (Stage 1)",
      is_read: false
    };

    expect(isActionRequiredNotification(notif)).toBe(true);

    handleNotificationItemClick(notif, onViewDocument, handleMarkAsRead, setPopoverOpen);

    expect(handleMarkAsRead).toHaveBeenCalledWith("NOTIF-01");
    expect(onViewDocument).toHaveBeenCalledWith("INV-101");
    expect(setPopoverOpen).toHaveBeenCalledWith(false);
  });

  it("Scenario 1b: Action Required (SENT_BACK) marks read and redirects", () => {
    const onViewDocument = vi.fn();
    const handleMarkAsRead = vi.fn();
    const setPopoverOpen = vi.fn();

    const notif = {
      notification_id: "NOTIF-02",
      document_id: "INV-102",
      notification_type: "SENT_BACK",
      title: "Action Required: INV-102 Returned to You (Stage 1)",
      is_read: false
    };

    expect(isActionRequiredNotification(notif)).toBe(true);

    handleNotificationItemClick(notif, onViewDocument, handleMarkAsRead, setPopoverOpen);

    expect(handleMarkAsRead).toHaveBeenCalledWith("NOTIF-02");
    expect(onViewDocument).toHaveBeenCalledWith("INV-102");
    expect(setPopoverOpen).toHaveBeenCalledWith(false);
  });

  it("Scenario 2: Invoice Approved (APPROVED) marks read WITHOUT redirection", () => {
    const onViewDocument = vi.fn();
    const handleMarkAsRead = vi.fn();
    const setPopoverOpen = vi.fn();

    const notif = {
      notification_id: "NOTIF-03",
      document_id: "INV-103",
      notification_type: "APPROVED",
      title: "Invoice Approved: Stage 1 Passed (INV-103)",
      is_read: false
    };

    expect(isActionRequiredNotification(notif)).toBe(false);

    handleNotificationItemClick(notif, onViewDocument, handleMarkAsRead, setPopoverOpen);

    expect(handleMarkAsRead).toHaveBeenCalledWith("NOTIF-03");
    expect(onViewDocument).not.toHaveBeenCalled();
    expect(setPopoverOpen).not.toHaveBeenCalled();
  });

  it("Scenario 3: Invoice Rejected (REJECTED) marks read WITHOUT redirection", () => {
    const onViewDocument = vi.fn();
    const handleMarkAsRead = vi.fn();
    const setPopoverOpen = vi.fn();

    const notif = {
      notification_id: "NOTIF-04",
      document_id: "INV-104",
      notification_type: "REJECTED",
      title: "Document Returned: INV-104 (Stage 1)",
      is_read: false
    };

    expect(isActionRequiredNotification(notif)).toBe(false);

    handleNotificationItemClick(notif, onViewDocument, handleMarkAsRead, setPopoverOpen);

    expect(handleMarkAsRead).toHaveBeenCalledWith("NOTIF-04");
    expect(onViewDocument).not.toHaveBeenCalled();
    expect(setPopoverOpen).not.toHaveBeenCalled();
  });

  it("Scenario 4: Fully Approved / Completed (COMPLETED) marks read WITHOUT redirection", () => {
    const onViewDocument = vi.fn();
    const handleMarkAsRead = vi.fn();
    const setPopoverOpen = vi.fn();

    const notif = {
      notification_id: "NOTIF-05",
      document_id: "INV-105",
      notification_type: "COMPLETED",
      title: "Document Fully Approved: INV-105",
      is_read: false
    };

    expect(isActionRequiredNotification(notif)).toBe(false);

    handleNotificationItemClick(notif, onViewDocument, handleMarkAsRead, setPopoverOpen);

    expect(handleMarkAsRead).toHaveBeenCalledWith("NOTIF-05");
    expect(onViewDocument).not.toHaveBeenCalled();
    expect(setPopoverOpen).not.toHaveBeenCalled();
  });
});
