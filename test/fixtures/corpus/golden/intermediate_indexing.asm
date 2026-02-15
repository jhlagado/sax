; ZAX lowered .asm trace
; range: $0000..$0051 (end exclusive)

; func main begin
main:
ld A, (idx)                    ; 0000: 3A 00 00
ld H, $0000                    ; 0003: 26 00
ld L, A                        ; 0005: 6F
push HL                        ; 0006: E5
pop HL                         ; 0007: E1
push HL                        ; 0008: E5
ld HL, arr                     ; 0009: 21 00 00
pop DE                         ; 000C: D1
add HL, DE                     ; 000D: 19
push HL                        ; 000E: E5
pop HL                         ; 000F: E1
ld A, (hl)                     ; 0010: 7E
ld HL, (idxw)                  ; 0011: 2A 00 00
push HL                        ; 0014: E5
pop HL                         ; 0015: E1
push HL                        ; 0016: E5
ld HL, arr                     ; 0017: 21 00 00
pop DE                         ; 001A: D1
add HL, DE                     ; 001B: 19
push HL                        ; 001C: E5
pop HL                         ; 001D: E1
ld A, (hl)                     ; 001E: 7E
push HL                        ; 001F: E5
ld HL, arr                     ; 0020: 21 00 00
pop DE                         ; 0023: D1
add HL, DE                     ; 0024: 19
push HL                        ; 0025: E5
pop HL                         ; 0026: E1
ld A, (hl)                     ; 0027: 7E
ld a, (hl)                     ; 0028: 7E
ld L, A                        ; 0029: 6F
ld H, $0000                    ; 002A: 26 00
push HL                        ; 002C: E5
ld HL, arr                     ; 002D: 21 00 00
pop DE                         ; 0030: D1
add HL, DE                     ; 0031: 19
push HL                        ; 0032: E5
pop HL                         ; 0033: E1
ld A, (hl)                     ; 0034: 7E
ld HL, $0000                   ; 0035: 21 00 00
push HL                        ; 0038: E5
ld A, (idx)                    ; 0039: 3A 00 00
ld H, $0000                    ; 003C: 26 00
ld L, A                        ; 003E: 6F
push HL                        ; 003F: E5
pop HL                         ; 0040: E1
add HL, HL                     ; 0041: 29
add HL, HL                     ; 0042: 29
push HL                        ; 0043: E5
ld HL, grid                    ; 0044: 21 00 00
pop DE                         ; 0047: D1
add HL, DE                     ; 0048: 19
push HL                        ; 0049: E5
pop HL                         ; 004A: E1
pop DE                         ; 004B: D1
add HL, DE                     ; 004C: 19
push HL                        ; 004D: E5
pop HL                         ; 004E: E1
ld A, (hl)                     ; 004F: 7E
ret                            ; 0050: C9
; func main end

; symbols:
; label main = $0000
; var idx = $1000
; var idxw = $1001
; var arr = $1003
; var grid = $1013
