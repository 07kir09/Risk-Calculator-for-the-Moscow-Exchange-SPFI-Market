import { ReactNode } from "react";

type AppTableRow = {
  key: string | number;
  cells: ReactNode[];
  onClick?: () => void;
};

export default function AppTable({
  ariaLabel,
  headers,
  rows,
  emptyContent,
}: {
  ariaLabel: string;
  headers: ReactNode[];
  rows: AppTableRow[];
  emptyContent?: ReactNode;
}) {
  return (
    <table aria-label={ariaLabel} className="heroTable">
      <thead>
        <tr className="heroTableRow">
          {headers.map((header, index) => (
            <th key={index} className="heroTableHeader">
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length ? (
          rows.map((row) => (
            <tr
              key={row.key}
              className="heroTableRow"
              onClick={row.onClick}
              style={row.onClick ? { cursor: "pointer" } : undefined}
            >
              {row.cells.map((cell, index) => (
                <td key={index} className="heroTableCell">
                  {cell}
                </td>
              ))}
            </tr>
          ))
        ) : (
          <tr className="heroTableRow">
            <td className="heroTableCell" colSpan={headers.length}>
              {emptyContent ?? "Нет данных."}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
