import { NOTIFICATION_TYPES, renderNotificationTemplate } from "../templates";

describe("notification templates", () => {
  it.each(NOTIFICATION_TYPES)("renders HTML and text for %s", (type) => {
    const rendered = renderNotificationTemplate(type, {
      username: "Ada",
      amount: "5 XLM",
      postTitle: "A new post",
      proposalTitle: "Fee update",
    });
    expect(rendered.subject.length).toBeGreaterThan(0);
    expect(rendered.text.length).toBeGreaterThan(0);
    expect(rendered.html).toBe(`<p>${rendered.text}</p>`);
  });

  it("substitutes provided values and escapes untrusted HTML content", () => {
    const rendered = renderNotificationTemplate("mention", {
      username: "<img src=x>",
      postTitle: "A & B",
    });
    expect(rendered.text).toContain("<img src=x>");
    expect(rendered.html).toContain("&lt;img src=x&gt;");
    expect(rendered.html).toContain("A &amp; B");
  });

  it("uses safe fallbacks for missing variables", () => {
    expect(renderNotificationTemplate("tip").text).toContain("Someone");
    expect(renderNotificationTemplate("tip").text).toContain("an amount");
  });
});
