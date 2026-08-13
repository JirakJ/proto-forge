import { render } from "@testing-library/react";
import { SafeHtml } from "./SafeHtml";

describe("SafeHtml", () => {
  it("renders allowed markup and strips scripts", () => {
    const { container } = render(<SafeHtml html={"<b>ok</b><script>alert(1)</script>"} />);
    expect(container.querySelector("b")?.textContent).toBe("ok");
    expect(container.querySelector("script")).toBeNull();
  });
});
