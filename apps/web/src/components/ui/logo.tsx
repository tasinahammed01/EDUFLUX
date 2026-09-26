import Link from "next/link";

export function Logo() {
  return <Link className="logo" href="/" aria-label="MENTRA home"><span className="logo-mark" aria-hidden="true"><i /><i /><i /></span><span>MENTRA</span></Link>;
}
