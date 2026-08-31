import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportDocumentDialog } from "@ts/components/dialogs/ImportDocumentDialog";

const jsonFile = (content: unknown, name = "doc.json") =>
  new File([JSON.stringify(content)], name, { type: "application/json" });

describe("ImportDocumentDialog", () => {
  it("imports only the fields that match the document's schema", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    const onClose = vi.fn();

    render(
      <ImportDocumentDialog
        open
        onClose={onClose}
        schemaFieldNames={["title", "body"]}
        onImport={onImport}
      />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, jsonFile({ title: "Hello", body: "World", _id: "should-be-stripped" }));

    await waitFor(() => expect(onImport).toHaveBeenCalledWith({ title: "Hello", body: "World" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows an inline error and does not import when the file is not a JSON object", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    const onClose = vi.fn();

    render(
      <ImportDocumentDialog
        open
        onClose={onClose}
        schemaFieldNames={["title"]}
        onImport={onImport}
      />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, jsonFile(["not", "an", "object"]));

    expect(await screen.findByText(/Expected a JSON object/)).toBeInTheDocument();
    expect(onImport).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
