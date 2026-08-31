/**
 * Regression coverage: the dialog must await onImport and surface a rejection
 * as an inline error instead of closing as if the import had succeeded.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportSchemaDialog } from "@ts/components/dialogs/ImportSchemaDialog";

const jsonFile = (content: unknown, name = "schema.json") =>
  new File([JSON.stringify(content)], name, { type: "application/json" });

describe("ImportSchemaDialog", () => {
  it("parses a fields-array file and calls onImport, then closes", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(<ImportSchemaDialog open onClose={onClose} onImport={onImport} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, jsonFile([{ _name: "title", _type: "String" }]));
    await user.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(onImport).toHaveBeenCalledWith([
      { fields: [{ _name: "title", _type: "String" }] },
    ]));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("parses an object with a folder name into folderName", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn().mockResolvedValue(undefined);

    render(<ImportSchemaDialog open onClose={vi.fn()} onImport={onImport} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, jsonFile({ _folder: "Blog", fields: [{ _name: "title" }] }));
    await user.click(screen.getByRole("button", { name: "Import" }));

    await waitFor(() => expect(onImport).toHaveBeenCalledWith([
      { fields: [{ _name: "title" }], folderName: "Blog" },
    ]));
  });

  it("shows an inline error and stays open when onImport rejects (e.g. folder creation fails)", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn().mockRejectedValue(new Error("Failed to create folder"));
    const onClose = vi.fn();

    render(<ImportSchemaDialog open onClose={onClose} onImport={onImport} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, jsonFile([{ _name: "title" }]));
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("Failed to create folder")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows an inline error for malformed JSON without calling onImport", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();

    render(<ImportSchemaDialog open onClose={vi.fn()} onImport={onImport} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["not json"], "bad.json", { type: "application/json" }));
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText(/Invalid JSON|Unexpected token/)).toBeInTheDocument();
    expect(onImport).not.toHaveBeenCalled();
  });
});
