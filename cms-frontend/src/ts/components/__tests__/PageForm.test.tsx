/**
 * Render tests for PageForm/PageWrapper: pure presentational components with
 * no hooks/query dependencies, so no providers are needed here.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PageForm, PageWrapper } from "@ts/components/PageForm";

describe("PageForm", () => {
  it("renders the title, nav string, and children", () => {
    render(
      <PageForm formType="schema" formTitle="Article" pageNavigation="Home / Schema" submitBtnText="Save" onSubmit={vi.fn()}>
        <div>form body</div>
      </PageForm>
    );

    expect(screen.getByText("Article")).toBeInTheDocument();
    expect(screen.getByText("Home / Schema")).toBeInTheDocument();
    expect(screen.getByText("form body")).toBeInTheDocument();
  });

  it("submits the form when the submit button is clicked", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn(e => e.preventDefault());
    render(
      <PageForm formType="schema" formTitle="Article" submitBtnText="Save" onSubmit={onSubmit}>
        <div />
      </PageForm>
    );

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("hides the submit button when readOnly", () => {
    render(
      <PageForm formType="schema" formTitle="Article" submitBtnText="Save" onSubmit={vi.fn()} readOnly>
        <div />
      </PageForm>
    );

    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("renders extraButtons, afterSubmitButtons, and titleBadge", () => {
    render(
      <PageForm
        formType="schema"
        formTitle="Article"
        submitBtnText="Save"
        onSubmit={vi.fn()}
        extraButtons={[<button key="extra">Extra</button>]}
        afterSubmitButtons={[<button key="after">After</button>]}
        titleBadge={<span>Beta</span>}
      >
        <div />
      </PageForm>
    );

    expect(screen.getByRole("button", { name: "Extra" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "After" })).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("calls setOpenedPanel with invalid field ids on submit-click validation", async () => {
    const user = userEvent.setup();
    const setOpenedPanel = vi.fn();
    render(
      <PageForm formType="schema" formTitle="Article" submitBtnText="Save" onSubmit={vi.fn(e => e.preventDefault())} setOpenedPanel={setOpenedPanel}>
        <input id="panelA-title" name="title" required />
      </PageForm>
    );

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(setOpenedPanel).toHaveBeenCalledWith(["panelA-"]);
  });
});

describe("PageWrapper", () => {
  it("renders the wrapper title, extraButtons, and children", () => {
    render(
      <PageWrapper wrapperTitle="Posts" extraButtons={[<button key="new">New</button>]}>
        <div>list body</div>
      </PageWrapper>
    );

    expect(screen.getByText("Posts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
    expect(screen.getByText("list body")).toBeInTheDocument();
  });
});
