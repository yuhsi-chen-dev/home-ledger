// 分帳人固定兩位。要改名改這裡；沒有人員管理頁面（見 docs/02-decisions.md 0002）。
export const PEOPLE = [
  { id: "verna", name: "Verna" },
  { id: "miki", name: "Miki" },
] as const;

export type PersonId = (typeof PEOPLE)[number]["id"];

export const PERSON_IDS = ["verna", "miki"] as const;

export const nameOf = (id: PersonId) => PEOPLE.find((p) => p.id === id)!.name;

/** 兩人制，所以「另一個人」是確定的——還錢的一定是 payer 以外那位。 */
export const other = (id: PersonId): PersonId => (id === "verna" ? "miki" : "verna");
