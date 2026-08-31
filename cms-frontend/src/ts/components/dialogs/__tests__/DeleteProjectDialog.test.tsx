import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteProjectDialog } from "@ts/components/dialogs/DeleteProjectDialog";

describe("DeleteProjectDialog", () => {
  it("shows the project name and does nothing on Cancel", async () => {
    const user = userEvent.setup();
    const removeProject = vi.fn();
    const onDeleted = vi.fn();

    render(
      <DeleteProjectDialog
        open
        onClose={vi.fn()}
        projectName="My Project"
        removeProject={removeProject}
        onDeleted={onDeleted}
      />
    );

    expect(screen.getByText(/My Project/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(removeProject).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("calls onDeleted only when removeProject resolves true", async () => {
    const user = userEvent.setup();
    const removeProject = vi.fn().mockResolvedValue(true);
    const onDeleted = vi.fn();

    render(
      <DeleteProjectDialog
        open
        onClose={vi.fn()}
        projectName="My Project"
        removeProject={removeProject}
        onDeleted={onDeleted}
      />
    );

    await user.click(screen.getByRole("button", { name: "Delete Project" }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });

  it("does not call onDeleted when removeProject resolves false", async () => {
    const user = userEvent.setup();
    const removeProject = vi.fn().mockResolvedValue(false);
    const onDeleted = vi.fn();

    render(
      <DeleteProjectDialog
        open
        onClose={vi.fn()}
        projectName="My Project"
        removeProject={removeProject}
        onDeleted={onDeleted}
      />
    );

    await user.click(screen.getByRole("button", { name: "Delete Project" }));

    await waitFor(() => expect(removeProject).toHaveBeenCalled());
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
