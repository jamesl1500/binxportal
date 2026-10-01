"""
The importable fields for each import kind, and the header aliases used to
guess which spreadsheet column is which. Aliases are compared after
normalizing both sides (lowercased, letters and digits only), so "E-mail
Address", "email_address", and "Email address" all match "emailaddress".
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from binx_api.modules.imports.schemas import ImportFieldRead, ImportKind


@dataclass(frozen=True)
class ImportField:
    key: str
    label: str
    required: bool
    aliases: tuple[str, ...]


CLIENT_FIELDS: tuple[ImportField, ...] = (
    ImportField(
        "name",
        "Client name",
        True,
        (
            "name",
            "client",
            "clientname",
            "company",
            "companyname",
            "business",
            "businessname",
            "organization",
            "organisation",
            "account",
            "accountname",
            "customer",
            "customername",
        ),
    ),
    ImportField(
        "primary_contact_name",
        "Contact name",
        False,
        ("contact", "contactname", "primarycontact", "primarycontactname", "contactperson", "fullname", "person"),
    ),
    ImportField(
        "primary_contact_email",
        "Contact email",
        False,
        ("email", "emailaddress", "contactemail", "primarycontactemail", "mail", "email1"),
    ),
    ImportField(
        "primary_contact_phone",
        "Contact phone",
        False,
        ("phone", "phonenumber", "telephone", "tel", "mobile", "cell", "contactphone", "primarycontactphone"),
    ),
    ImportField("website", "Website", False, ("website", "url", "site", "web", "domain", "homepage", "websiteurl")),
    ImportField("notes", "Notes", False, ("notes", "note", "comments", "comment", "description", "details")),
    ImportField(
        "billing_email",
        "Billing email",
        False,
        ("billingemail", "invoiceemail", "invoicingemail", "accountsemail", "financeemail", "accountspayable"),
    ),
    ImportField(
        "billing_address",
        "Billing address",
        False,
        ("billingaddress", "address", "mailingaddress", "postaladdress", "invoiceaddress"),
    ),
)

TEAM_FIELDS: tuple[ImportField, ...] = (
    ImportField("email", "Email", True, ("email", "emailaddress", "workemail", "mail", "teammemberemail")),
    ImportField("role", "Role", False, ("role", "accessrole", "access", "permission", "permissions", "agencyrole")),
)

FIELDS_BY_KIND: dict[str, tuple[ImportField, ...]] = {"clients": CLIENT_FIELDS, "team": TEAM_FIELDS}

_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def normalize_header(value: str) -> str:
    return _NON_ALNUM.sub("", value.lower())


def field_reads(kind: ImportKind) -> list[ImportFieldRead]:
    return [
        ImportFieldRead(key=field.key, label=field.label, required=field.required) for field in FIELDS_BY_KIND[kind]
    ]


def suggest_mapping(kind: ImportKind, headers: list[str]) -> dict[str, int | None]:
    """Each field → the first not-yet-claimed column whose header is one of
    its aliases (or its own label), else None. Fields claim columns in
    declaration order, so the more specific "billing email" column isn't
    grabbed by "Contact email"'s generic "email" alias unless it's literally
    named "Email"."""
    normalized = [normalize_header(header) for header in headers]
    claimed: set[int] = set()
    mapping: dict[str, int | None] = {}
    for field in FIELDS_BY_KIND[kind]:
        names = {normalize_header(field.label), normalize_header(field.key), *field.aliases}
        match = next(
            (index for index, header in enumerate(normalized) if header in names and index not in claimed),
            None,
        )
        if match is not None:
            claimed.add(match)
        mapping[field.key] = match
    return mapping
