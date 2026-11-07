#!/usr/bin/env python3
"""Validate filtered Docker inspect metadata for this disposable HTTP backend.

Docker Engine on Linux exposes this internal bridge to its own host.
Only filtered inspect JSON is accepted; this helper makes no network calls.
"""
from __future__ import annotations

import argparse
import ipaddress
import json
from pathlib import Path
import re
import sys

PRIVATE = tuple(ipaddress.ip_network(value) for value in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"))


class Stopped(ValueError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def resolve(container: dict, postgres: dict, network: dict, container_id: str, postgres_id: str, network_id: str, run_key: str) -> str:
    require(all(re.fullmatch(r"[0-9a-f]{64}", value) for value in (container_id, postgres_id, network_id)), "invalid expected resource ID")
    require(len({container_id, postgres_id, network_id}) == 3, "resource IDs must differ")
    require(bool(run_key), "missing run identity")
    require(all(isinstance(item, dict) for item in (container, postgres, network)), "inspect metadata must be objects")
    require(container.get("Id") == container_id and postgres.get("Id") == postgres_id and network.get("Id") == network_id, "inspect returned a different resource")
    require(container.get("Config", {}).get("Labels", {}).get("zapp.edge-harness") == run_key, "container ownership label differs")
    require(postgres.get("Config", {}).get("Labels", {}).get("zapp.edge-harness") == run_key, "PostgreSQL ownership label differs")
    require(network.get("Labels", {}).get("zapp.edge-harness") == run_key, "network ownership label differs")
    state = container.get("State", {})
    settings = container.get("NetworkSettings", {})
    require(isinstance(state, dict) and isinstance(settings, dict), "invalid container metadata")
    print("[DIAG] PostgREST " + json.dumps({key: state.get(key) for key in ("Running", "ExitCode", "Error")} | {"Ports": settings.get("Ports")}, ensure_ascii=False), file=sys.stderr)
    require(type(state.get("Running")) is bool, "missing boolean running state")
    if state["Running"] is False:
        raise Stopped("PostgREST container exited before readiness")
    require(type(state.get("ExitCode")) is int and state["ExitCode"] == 0, "unexpected running exit code")
    require(network.get("Internal") is True and network.get("Driver") == "bridge", "network is not an internal bridge")
    name = network.get("Name")
    require(isinstance(name, str) and bool(name), "network name missing")
    attached = settings.get("Networks")
    require(isinstance(attached, dict) and set(attached) == {name}, "container must have exactly its own network")
    endpoint = attached[name]
    require(isinstance(endpoint, dict) and endpoint.get("NetworkID") == network_id, "endpoint belongs to another network")
    host = container.get("HostConfig", {})
    require(isinstance(host, dict) and host.get("NetworkMode") == name, "unexpected network mode")
    require(not host.get("PortBindings"), "host port publication must not be requested")
    ports = settings.get("Ports")
    require(ports is None or isinstance(ports, dict), "invalid port metadata")
    require(not any(value for value in (ports or {}).values()), "host ports must not be published")
    members = network.get("Containers")
    require(isinstance(members, dict) and set(members) == {container_id, postgres_id}, "network membership differs from the two owned containers")
    address = ipaddress.IPv4Address(endpoint.get("IPAddress", ""))
    require(any(address in private for private in PRIVATE), "PostgREST address is not RFC1918 IPv4")
    config = network.get("IPAM", {}).get("Config")
    require(isinstance(config, list), "IPAM configuration missing")
    subnets = [ipaddress.ip_network(item["Subnet"]) for item in config if "Subnet" in item]
    subnets = [subnet for subnet in subnets if subnet.version == 4]
    require(len(subnets) == 1, "expected exactly one IPv4 subnet")
    subnet = subnets[0]
    require(any(subnet.subnet_of(private) for private in PRIVATE), "network subnet is not RFC1918")
    require(address in subnet and address not in (subnet.network_address, subnet.broadcast_address), "address is not a host in the owned subnet")
    require(endpoint.get("IPPrefixLen") == subnet.prefixlen, "endpoint prefix differs from network subnet")
    member = ipaddress.IPv4Interface(members[container_id].get("IPv4Address", ""))
    require(member.ip == address and member.network == subnet, "network membership address differs from container")
    gateways = [item.get("Gateway") for item in config if item.get("Gateway")]
    require(str(address) not in gateways, "PostgREST address is the network gateway")
    pg_settings = postgres.get("NetworkSettings", {})
    pg_networks = pg_settings.get("Networks")
    require(isinstance(pg_networks, dict) and set(pg_networks) == {name}, "PostgreSQL must have exactly its own network")
    pg_endpoint = pg_networks[name]
    require(pg_endpoint.get("NetworkID") == network_id, "PostgreSQL endpoint belongs to another network")
    pg_host = postgres.get("HostConfig", {})
    require(pg_host.get("NetworkMode") == name and not pg_host.get("PortBindings"), "PostgreSQL network mode or publication differs")
    pg_ports = pg_settings.get("Ports")
    require(pg_ports is None or isinstance(pg_ports, dict), "invalid PostgreSQL port metadata")
    require(not any(value for value in (pg_ports or {}).values()), "PostgreSQL host ports must not be published")
    pg_address = ipaddress.IPv4Address(pg_endpoint.get("IPAddress", ""))
    require(pg_address in subnet and pg_address not in (address, subnet.network_address, subnet.broadcast_address), "invalid PostgreSQL address in the owned subnet")
    require(str(pg_address) not in gateways and pg_endpoint.get("IPPrefixLen") == subnet.prefixlen, "PostgreSQL gateway or prefix differs")
    pg_member = ipaddress.IPv4Interface(members[postgres_id].get("IPv4Address", ""))
    require(pg_member.ip == pg_address and pg_member.network == subnet, "PostgreSQL membership address differs from container")
    require(postgres.get("State", {}).get("Running") is True, "PostgreSQL container is not running")
    return f"http://{address}:3000"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("container", type=Path)
    parser.add_argument("postgres", type=Path)
    parser.add_argument("network", type=Path)
    parser.add_argument("container_id")
    parser.add_argument("postgres_id")
    parser.add_argument("network_id")
    parser.add_argument("run_key")
    args = parser.parse_args()
    try:
        container = json.loads(args.container.read_text(encoding="utf-8"))
        postgres = json.loads(args.postgres.read_text(encoding="utf-8"))
        network = json.loads(args.network.read_text(encoding="utf-8"))
        url = resolve(container, postgres, network, args.container_id, args.postgres_id, args.network_id, args.run_key)
    except Stopped as exc:
        print(f"[FAIL] {exc}", file=sys.stderr)
        return 2
    except (OSError, ValueError, TypeError, AttributeError, KeyError) as exc:
        print(f"[FAIL] local PostgREST metadata: {exc}", file=sys.stderr)
        return 1
    print(url)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
