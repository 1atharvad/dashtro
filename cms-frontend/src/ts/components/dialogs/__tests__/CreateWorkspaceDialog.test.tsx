import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateWorkspaceDialog } from "@ts/components/dialogs/CreateWorkspaceDialog";

describe("CreateWorkspaceDialog", () => {
  it("rejects 'production' and disallows Create until the name is valid", async () => {
    const user = userEvent.setup();
    const addWorkspace = vi.fn();

    render(<CreateWorkspaceDialog open onClose={vi.fn()} addWorkspace={addWorkspace} />);

    const input = screen.getByLabelText("Workspace name");
    await user.type(input, "production");

    expect(screen.getByText("'production' is reserved.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("lowercases and dash-cases the name, then creates it on confirm", async () => {
    const user = userEvent.setup();
    const addWorkspace = vi.fn().mockResolvedValue(undefined);

    render(<CreateWorkspaceDialog open onClose={vi.fn()} addWorkspace={addWorkspace} />);

    await user.type(screen.getByLabelText("Workspace name"), "My Staging");
    await user.click(screen.getByRole("button", { name: "Create" }));

    expect(addWorkspace).toHaveBeenCalledWith("my-staging");
  });

  it("resets the name field after Cancel", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<CreateWorkspaceDialog open onClose={onClose} addWorkspace={vi.fn()} />);

    await user.type(screen.getByLabelText("Workspace name"), "staging");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Workspace name")).toHaveValue("");
  });

  it("does not disable Create just because addWorkspace eventually fails (error surfaces via toast, dialog already closed)", async () => {
    const user = userEvent.setup();
    const addWorkspace = vi.fn().mockRejectedValue(new Error("boom"));

    render(<CreateWorkspaceDialog open onClose={vi.fn()} addWorkspace={addWorkspace} />);

    await user.type(screen.getByLabelText("Workspace name"), "staging");
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(addWorkspace).toHaveBeenCalledWith("staging"));
  });
});
