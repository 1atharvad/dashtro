/**
 * Regression coverage: removeSchemaName/onDeleted should only fire once every
 * field delete in the batch has actually succeeded, not unconditionally.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteSchemaDialog } from "@ts/components/dialogs/DeleteSchemaDialog";

describe("DeleteSchemaDialog", () => {
  it("does not delete anything when Cancel is clicked", async () => {
    const user = userEvent.setup();
    const deleteSchemaData = vi.fn();
    const removeSchemaName = vi.fn();
    const onDeleted = vi.fn();

    render(
      <DeleteSchemaDialog
        open
        onClose={vi.fn()}
        schemaName="Article"
        fieldIds={["f1", "f2"]}
        deleteSchemaData={deleteSchemaData}
        removeSchemaName={removeSchemaName}
        onDeleted={onDeleted}
      />
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleteSchemaData).not.toHaveBeenCalled();
    expect(removeSchemaName).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("deletes every field and removes the schema name when all deletes succeed", async () => {
    const user = userEvent.setup();
    const deleteSchemaData = vi.fn().mockResolvedValue(true);
    const removeSchemaName = vi.fn();
    const onDeleted = vi.fn();

    render(
      <DeleteSchemaDialog
        open
        onClose={vi.fn()}
        schemaName="Article"
        fieldIds={["f1", "f2"]}
        deleteSchemaData={deleteSchemaData}
        removeSchemaName={removeSchemaName}
        onDeleted={onDeleted}
      />
    );

    await user.click(screen.getByRole("button", { name: "Delete Schema" }));

    expect(deleteSchemaData).toHaveBeenCalledWith("f1");
    expect(deleteSchemaData).toHaveBeenCalledWith("f2");
    await waitFor(() => expect(removeSchemaName).toHaveBeenCalledWith("Article"));
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("does not remove the schema name or fire onDeleted if any field delete fails", async () => {
    const user = userEvent.setup();
    const deleteSchemaData = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const removeSchemaName = vi.fn();
    const onDeleted = vi.fn();

    render(
      <DeleteSchemaDialog
        open
        onClose={vi.fn()}
        schemaName="Article"
        fieldIds={["f1", "f2"]}
        deleteSchemaData={deleteSchemaData}
        removeSchemaName={removeSchemaName}
        onDeleted={onDeleted}
      />
    );

    await user.click(screen.getByRole("button", { name: "Delete Schema" }));

    await waitFor(() => expect(deleteSchemaData).toHaveBeenCalledTimes(2));
    expect(removeSchemaName).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
