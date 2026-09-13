/**
 * Integration tests for SchemaComponent: a real QueryClient with `authFetch`
 * mocked (same pattern as useSchema.test.tsx). Schema-preset and category
 * caches are seeded directly since those endpoints aren't under test here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { toast } from "advi-ui";
import { createTestQueryClient, withQueryClient } from "@/test/queryClient";
import { schemaPresetKeys } from "@ts/api/schemaPresets";
import { categoryKeys } from "@ts/api/categories";
import { SchemaComponent } from "@ts/components/SchemaComponent";
import type { SchemaFieldItem, SchemaListResponse } from "@ts/types/constants";

vi.mock("@ts/utils/auth", () => ({
  authFetch: vi.fn(),
}));

import { authFetch } from "@ts/utils/auth";

const mockedAuthFetch = vi.mocked(authFetch);
const projectId = "proj-1";

const preset: SchemaListResponse = {
  _schema_names: ["Article", "Author"],
  _schema_variables: {},
};

const titleField: SchemaFieldItem = {
  _id: "f1", _index: 1, _name: "title", _type: "String", _description: "",
  _relation: "OneToOne", _default_value: "", _placeholder: "", _nested_schema: "",
  _reference_schema: [], _rich_text_wrapper: "", _display_name: true, _required: false,
};

const seedCaches = (queryClient: ReturnType<typeof createTestQueryClient>) => {
  queryClient.setQueryData(schemaPresetKeys.byProject(projectId), preset);
  queryClient.setQueryData(categoryKeys.byProject(projectId), { categories: [], category_map: {} });
};

const renderSchemaComponent = (componentName: string, newSchema = false, queryClient = createTestQueryClient()) => {
  seedCaches(queryClient);
  return render(
    <MemoryRouter initialEntries={[`/projects/${projectId}/schema/${componentName}/`]}>
      <Routes>
        <Route
          path="/projects/:project_id/schema/:componentName/"
          element={<SchemaComponent componentName={componentName} newSchema={newSchema} />}
        />
      </Routes>
    </MemoryRouter>,
    { wrapper: withQueryClient(queryClient) }
  );
};

beforeEach(() => {
  mockedAuthFetch.mockReset();
  vi.spyOn(toast, "success").mockImplementation(() => {});
  vi.spyOn(toast, "error").mockImplementation(() => {});
});

describe("SchemaComponent", () => {
  it("renders the schema title and its existing fields", async () => {
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => ({ Article: [titleField] }) } as Response);

    renderSchemaComponent("Article");

    expect(await screen.findByText("Article")).toBeInTheDocument();
    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Schema" })).toBeInTheDocument();
  });

  it("adds a new blank entry when the add-variable button is clicked", async () => {
    const user = userEvent.setup();
    mockedAuthFetch.mockResolvedValue({ ok: true, json: async () => ({ Article: [titleField] }) } as Response);

    renderSchemaComponent("Article");
    await screen.findByText("title");
    expect(screen.queryAllByText(/New Entry - Schema/)).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "add" }));

    expect(screen.getAllByText(/New Entry - Schema/i)).not.toHaveLength(0);
  });

  it("submits new fields, strips empty values, and shows a success toast", async () => {
    const user = userEvent.setup();
    mockedAuthFetch.mockImplementation(async (_input: RequestInfo, init?: RequestInit) => {
      if (init?.method === "POST") {
        return { ok: true, json: async () => ({ ...titleField, _id: "f2", _name: "", _schema_name: "Article" }) } as Response;
      }
      return { ok: true, json: async () => ({ Article: [] }) } as Response;
    });

    renderSchemaComponent("Article", true);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save Schema" })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Save Schema" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Schema field added"));
    expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/projects/${projectId}/schema/`),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("opens the delete-schema confirmation from the actions menu and deletes on confirm", async () => {
    const user = userEvent.setup();
    mockedAuthFetch.mockImplementation(async (_input: RequestInfo, init?: RequestInit) => {
      if (init?.method === "DELETE") return { ok: true } as Response;
      return { ok: true, json: async () => ({ Article: [titleField] }) } as Response;
    });

    renderSchemaComponent("Article");
    await screen.findByText("title");

    await user.click(screen.getAllByRole("button", { name: "Actions" })[0]);
    await user.click(await screen.findByText("Delete Schema"));
    await user.click(screen.getByRole("button", { name: "Delete Schema" }));

    await waitFor(() => expect(mockedAuthFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/schema/${titleField._id}/`),
      expect.objectContaining({ method: "DELETE" })
    ));
  });
});
