import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

describe("Table density and header treatment (spec Requirement 4)", () => {
  it("TableHeader has bg-muted/40; TableHead has uppercase, tracking, h-11", () => {
    const html = renderToStaticMarkup(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Folio</TableHead>
          </TableRow>
        </TableHeader>
      </Table>
    );

    expect(html).toContain("bg-muted/40");
    expect(html).toContain("uppercase");
    expect(html).toContain("tracking-wide");
    expect(html).toContain("h-11");
  });

  it("TableCell has px-4 py-3.5", () => {
    const html = renderToStaticMarkup(
      <Table>
        <tbody>
          <TableRow>
            <TableCell>Contenido</TableCell>
          </TableRow>
        </tbody>
      </Table>
    );

    expect(html).toContain("px-4");
    expect(html).toContain("py-3.5");
  });
});
