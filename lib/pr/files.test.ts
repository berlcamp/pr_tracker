import { expect, test } from "vitest";
import { safeFileName, validateFile } from "./files";

test("safeFileName strips unsafe chars and keeps extension", () => {
  expect(safeFileName("Quotation (final) #2.pdf")).toBe("Quotation_final_2.pdf");
  expect(safeFileName("../../etc/passwd")).toBe("etc_passwd");
  expect(safeFileName("x".repeat(200) + ".pdf").length).toBeLessThanOrEqual(100);
});
test("validateFile", () => {
  expect(validateFile({ name: "a.pdf", size: 1000, type: "application/pdf" }, 20)).toBeNull();
  expect(validateFile({ name: "a.exe", size: 1000, type: "application/x-msdownload" }, 20)).toBe("File type not allowed. Use PDF, JPG, PNG, DOCX or XLSX.");
  expect(validateFile({ name: "a.pdf", size: 21 * 1024 * 1024, type: "application/pdf" }, 20)).toBe("File is larger than 20 MB.");
  expect(validateFile({ name: "a.pdf", size: 0, type: "application/pdf" }, 20)).toBe("File is empty.");
  expect(validateFile({ name: "a.docx", size: 10, type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }, 20, true))
    .toBe("The PR document must be a PDF, JPG or PNG file.");
  expect(validateFile({ name: "a.png", size: 10, type: "image/png" }, 20, true)).toBeNull();
});
