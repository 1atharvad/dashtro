import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SyncConfirmDialog } from "@ts/components/dialogs/SyncConfirmDialog";

const baseProps = {
  onClose: vi.fn(),
  documentLabel: "My Post",
  documentId: "doc-1",
  pullDocumentData: vi.fn(),
  pushDocumentData: vi.fn(),
  onSynced: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SyncConfirmDialog", () => {
  it("is closed when mode is null", () => {
    render(<SyncConfirmDialog {...baseProps} mode={null} />);
    expect(screen.queryByText(/Push document/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pull document/)).not.toBeInTheDocument();
  });

  it("pushes and calls onSynced(false) on confirm in push mode", async () => {
    const user = userEvent.setup();
    const pushDocumentData = vi.fn().mockResolvedValue(undefined);
    const onSynced = vi.fn();

    render(<SyncConfirmDialog {...baseProps} mode="push" pushDocumentData={pushDocumentData} onSynced={onSynced} />);

    await user.click(screen.getByRole("button", { name: "Push" }));

    expect(pushDocumentData).toHaveBeenCalledWith("doc-1");
    await waitFor(() => expect(onSynced).toHaveBeenCalledWith(false));
    expect(baseProps.pullDocumentData).not.toHaveBeenCalled();
  });

  it("pulls and calls onSynced(true) on confirm in pull mode", async () => {
    const user = userEvent.setup();
    const pullDocumentData = vi.fn().mockResolvedValue(undefined);
    const onSynced = vi.fn();

    render(<SyncConfirmDialog {...baseProps} mode="pull" pullDocumentData={pullDocumentData} onSynced={onSynced} />);

    await user.click(screen.getByRole("button", { name: "Pull" }));

    expect(pullDocumentData).toHaveBeenCalledWith("doc-1");
    await waitFor(() => expect(onSynced).toHaveBeenCalledWith(true));
  });

  it("does not call onSynced when the sync fails", async () => {
    const user = userEvent.setup();
    const pushDocumentData = vi.fn().mockRejectedValue(new Error("boom"));
    const onSynced = vi.fn();

    render(<SyncConfirmDialog {...baseProps} mode="push" pushDocumentData={pushDocumentData} onSynced={onSynced} />);

    await user.click(screen.getByRole("button", { name: "Push" }));

    await waitFor(() => expect(pushDocumentData).toHaveBeenCalled());
    expect(onSynced).not.toHaveBeenCalled();
  });
});
