{ pkgs ? import <nixpkgs> {} }:
pkgs.mkShell {
  packages = [ pkgs.nodejs_22 pkgs.pnpm pkgs.zip ];
}
