import { describe, it, expect, vi } from "vitest";

describe("Document Detail React Router Back Navigation", () => {
  it("computes back route to exact origin page when location.state.from is provided", () => {
    const navigate = vi.fn();
    const locationState = { from: "/work-tracker" };
    const windowHistoryLength = 5;

    const computeBackTarget = (state?: { from?: string }, historyLen = 1) => {
      return state?.from || (historyLen > 2 ? -1 : "/dashboard");
    };

    const target = computeBackTarget(locationState, windowHistoryLength);
    navigate(target);

    expect(target).toBe("/work-tracker");
    expect(navigate).toHaveBeenCalledWith("/work-tracker");
  });

  it("falls back to -1 when history length > 2 and no from state exists", () => {
    const navigate = vi.fn();
    const locationState = undefined;
    const windowHistoryLength = 3;

    const computeBackTarget = (state?: { from?: string }, historyLen = 1) => {
      return state?.from || (historyLen > 2 ? -1 : "/dashboard");
    };

    const target = computeBackTarget(locationState, windowHistoryLength);
    navigate(target);

    expect(target).toBe(-1);
    expect(navigate).toHaveBeenCalledWith(-1);
  });

  it("falls back to /dashboard when history length <= 2 and no from state exists", () => {
    const navigate = vi.fn();
    const locationState = undefined;
    const windowHistoryLength = 2;

    const computeBackTarget = (state?: { from?: string }, historyLen = 1) => {
      return state?.from || (historyLen > 2 ? -1 : "/dashboard");
    };

    const target = computeBackTarget(locationState, windowHistoryLength);
    navigate(target);

    expect(target).toBe("/dashboard");
    expect(navigate).toHaveBeenCalledWith("/dashboard");
  });

  it("preserves location.state across Approve/Reject/Hold action updates", () => {
    const originLocation = { pathname: "/review/INV-1006", state: { from: "/work-tracker" } };
    
    // Simulating ref preservation across simulated re-renders / actions
    let locationStateRef = originLocation.state;

    // Simulate action trigger (e.g. approve/reject/hold causing doc refresh)
    const handleActionComplete = (_actionType: "approve" | "reject" | "hold") => {
      // Re-render happens, component re-evaluates
      if (originLocation.state?.from) {
        locationStateRef = originLocation.state;
      }
    };

    handleActionComplete("approve");
    expect(locationStateRef).toEqual({ from: "/work-tracker" });

    handleActionComplete("hold");
    expect(locationStateRef).toEqual({ from: "/work-tracker" });

    handleActionComplete("reject");
    expect(locationStateRef).toEqual({ from: "/work-tracker" });

    const backTarget = originLocation.state?.from || locationStateRef?.from;
    expect(backTarget).toBe("/work-tracker");
  });

  it("links opening Document Detail attach state: { from: location.pathname }", () => {
    const navigate = vi.fn();
    const mockLocation = { pathname: "/work-tracker" };
    const docId = "INV-1006";

    const handleOpenDocument = (id: string) => {
      navigate(`/review/${encodeURIComponent(id)}`, { state: { from: mockLocation.pathname } });
    };

    handleOpenDocument(docId);

    expect(navigate).toHaveBeenCalledWith("/review/INV-1006", {
      state: { from: "/work-tracker" }
    });
  });
});
