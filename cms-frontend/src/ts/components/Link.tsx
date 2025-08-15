import { ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Link as MatLink } from "@mui/material";

export interface CustomLink {
  url: string,
  text?: string,
  is_external_link: boolean
}

export const Link = ({ link, className, children }: { link: CustomLink, className?: string, children: ReactNode }) => {
  return link.is_external_link ? (
    <MatLink href={link.url} target="_blank" rel="noopener noreferrer" title={link.text} className={className}>
      {children}
    </MatLink>
  ) : (
    <MatLink component={RouterLink} to={link.url} title={link.text} className={className}>
      {children}
    </MatLink>
  );
};