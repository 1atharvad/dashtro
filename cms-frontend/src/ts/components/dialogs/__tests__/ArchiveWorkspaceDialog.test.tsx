import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "advi-ui";
import { ArchiveWorkspaceDialog } from "@ts/components/dialogs/ArchiveWorkspaceDialog";

beforeEach(() => {
  vi.spyOn(toast, "error").mockImplementation(() => {});
});

describe("ArchiveWorkspaceDialog", () => {
  it("is closed when workspaceName is null", () => {
    render(<ArchiveWorkspaceDialog workspaceName={null} onClose={vi.fn()} removeWorkspace={vi.fn()} />);
    expect(screen.queryByText("Archive workspace?")).not.toBeInTheDocument();
  });

  it("calls removeWorkspace with the workspace name on confirm", async () => {
    const user = userEvent.setup();
    const removeWorkspace = vi.fn().mockResolvedValue(undefined);

    render(<ArchiveWorkspaceDialog workspaceName="staging" onClose={vi.fn()} removeWorkspace={removeWorkspace} />);

    expect(screen.getByText(/staging/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Archive" }));

    expect(removeWorkspace).toHaveBeenCalledWith("staging");
  });

  it("shows an error toast when removeWorkspace rejects", async () => {
    const user = userEvent.setup();
    const removeWorkspace = vi.fn().mockRejectedValue(new Error("boom"));

    render(<ArchiveWorkspaceDialog workspaceName="staging" onClose={vi.fn()} removeWorkspace={removeWorkspace} />);
    await user.click(screen.getByRole("button", { name: "Archive" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("boom"));
  });
});
