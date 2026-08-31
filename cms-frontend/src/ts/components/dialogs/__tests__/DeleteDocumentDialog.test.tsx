/**
 * Regression coverage for the delete-confirm-fires-onDeleted-only-on-success
 * contract: previously onDeleted() ran unconditionally, so a failed delete
 * still navigated/refreshed the list as if it had succeeded.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteDocumentDialog } from "@ts/components/dialogs/DeleteDocumentDialog";

describe("DeleteDocumentDialog", () => {
  it("does not call deleteDocumentData or onDeleted when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const deleteDocumentData = vi.fn();
    const onDeleted = vi.fn();
    const onClose = vi.fn();

    render(
      <DeleteDocumentDialog
        open
        onClose={onClose}
        documentLabel="My Post"
        documentId="doc-1"
        deleteDocumentData={deleteDocumentData}
        onDeleted={onDeleted}
      />
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleteDocumentData).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onDeleted when the delete succeeds", async () => {
    const user = userEvent.setup();
    const deleteDocumentData = vi.fn().mockResolvedValue(true);
    const onDeleted = vi.fn();

    render(
      <DeleteDocumentDialog
        open
        onClose={vi.fn()}
        documentLabel="My Post"
        documentId="doc-1"
        deleteDocumentData={deleteDocumentData}
        onDeleted={onDeleted}
      />
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(deleteDocumentData).toHaveBeenCalledWith("doc-1");
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });

  it("does not call onDeleted when the delete fails (regression: used to fire unconditionally)", async () => {
    const user = userEvent.setup();
    const deleteDocumentData = vi.fn().mockResolvedValue(false);
    const onDeleted = vi.fn();

    render(
      <DeleteDocumentDialog
        open
        onClose={vi.fn()}
        documentLabel="My Post"
        documentId="doc-1"
        deleteDocumentData={deleteDocumentData}
        onDeleted={onDeleted}
      />
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteDocumentData).toHaveBeenCalled());
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
