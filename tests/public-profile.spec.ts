import { test, expect } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PublicRating } from "@/components/public-rating";
import {
  PublicCompanyDetails,
  type PublicCompany,
} from "@/components/public-company-details";

const company: PublicCompany = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Empresa de verificação",
  slug: "empresa-de-verificacao",
  description: "",
  timezone: "America/Sao_Paulo",
  category: null,
  city: null,
  state: null,
  address: null,
  phone: null,
  whatsapp: null,
  instagram: null,
  logo_path: null,
  cover_path: null,
  rating_average: null,
  rating_count: 0,
};

function profile(overrides: Partial<PublicCompany> = {}, comment?: string) {
  return renderToStaticMarkup(
    createElement(PublicCompanyDetails, {
      business: { ...company, ...overrides },
      services: [],
      hours: [],
      gallery: [],
      professionals: [],
      reviews:
        comment === undefined
          ? []
          : [
              {
                id: "00000000-0000-4000-8000-000000000002",
                business_id: company.id,
                rating: 4,
                comment,
                reviewer_name: "Cliente",
                created_at: "2026-10-14T12:00:00Z",
                updated_at: "2026-10-14T12:00:00Z",
              },
            ],
      date: "2026-10-14",
      unavailable: false,
      reviewsUnavailable: false,
    }),
  );
}

test("perfil mostra a média real e não inventa uma nota quando não há avaliações", () => {
  const actual = renderToStaticMarkup(
    createElement(PublicRating, { average: 4.75, count: 4 }),
  );
  expect(actual).toContain("4,8 de 5 estrelas, 4 avaliações");
  for (const average of [null, 5, Infinity, NaN]) {
    const empty = renderToStaticMarkup(
      createElement(PublicRating, { average, count: 0 }),
    );
    expect(empty).toContain("Sem avaliações");
    expect(empty).not.toContain("de 5 estrelas");
  }
});

test("contatos públicos usam apenas telefone e destinos fixos de WhatsApp e Instagram", () => {
  const valid = profile({
    phone: "(11) 91234-5678",
    whatsapp: "5511912345678",
    instagram: "@nuvemmeet",
  });
  expect(valid).toContain('href="tel:+5511912345678"');
  expect(valid).toContain('href="https://wa.me/5511912345678"');
  expect(valid).toContain('href="https://www.instagram.com/nuvemmeet/"');
  for (const instagram of [
    "javascript:alert(1)",
    "https://instagram.com.evil.invalid/user",
    "https://www.instagram.com/user/?next=https://evil.invalid",
    "https://user@www.instagram.com/user/",
  ]) {
    const invalid = profile({
      whatsapp: "https://evil.invalid",
      phone: "javascript:alert(1)",
      instagram,
    });
    expect(invalid).not.toContain('href="tel:');
    expect(invalid).not.toContain('href="https://wa.me/');
    expect(invalid).not.toContain('href="https://www.instagram.com/');
    expect(invalid).not.toContain('href="javascript:');
  }
});

test("comentários de clientes são texto e não executam HTML", () => {
  const html = profile(
    {},
    '<script>alert("segredo")</script><img src=x onerror=alert(1)>',
  );
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("<img src=x");
  expect(html).toContain("4 de 5 estrelas");
});
