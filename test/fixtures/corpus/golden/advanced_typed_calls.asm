; ZAX lowered .asm trace
; range: $0000..$005A (end exclusive)

; func main begin
main:
push AF                        ; 0000: F5
push BC                        ; 0001: C5
push DE                        ; 0002: D5
push IX                        ; 0003: DD E5
push IY                        ; 0005: FD E5
push HL                        ; 0007: E5
ld HL, $0001                   ; 0008: 21 01 00
push HL                        ; 000B: E5
call ping                      ; 000C: CD 00 00
pop BC                         ; 000F: C1
pop HL                         ; 0010: E1
pop IY                         ; 0011: FD E1
pop IX                         ; 0013: DD E1
pop DE                         ; 0015: D1
pop BC                         ; 0016: C1
pop AF                         ; 0017: F1
push AF                        ; 0018: F5
push BC                        ; 0019: C5
push DE                        ; 001A: D5
push IX                        ; 001B: DD E5
push IY                        ; 001D: FD E5
ld A, (idx)                    ; 001F: 3A 00 00
ld H, $0000                    ; 0022: 26 00
ld L, A                        ; 0024: 6F
push HL                        ; 0025: E5
pop HL                         ; 0026: E1
push HL                        ; 0027: E5
ld HL, arr                     ; 0028: 21 00 00
pop DE                         ; 002B: D1
add HL, DE                     ; 002C: 19
push HL                        ; 002D: E5
pop HL                         ; 002E: E1
ld a, (hl)                     ; 002F: 7E
ld H, $0000                    ; 0030: 26 00
ld L, A                        ; 0032: 6F
push HL                        ; 0033: E5
call getb                      ; 0034: CD 00 00
pop BC                         ; 0037: C1
pop IY                         ; 0038: FD E1
pop IX                         ; 003A: DD E1
pop DE                         ; 003C: D1
pop BC                         ; 003D: C1
pop AF                         ; 003E: F1
ld A, L                        ; 003F: 7D
push AF                        ; 0040: F5
push BC                        ; 0041: C5
push DE                        ; 0042: D5
push IX                        ; 0043: DD E5
push IY                        ; 0045: FD E5
ld HL, $0009                   ; 0047: 21 09 00
push HL                        ; 004A: E5
call getw                      ; 004B: CD 00 00
pop BC                         ; 004E: C1
pop IY                         ; 004F: FD E1
pop IX                         ; 0051: DD E1
pop DE                         ; 0053: D1
pop BC                         ; 0054: C1
pop AF                         ; 0055: F1
ld (out), HL                   ; 0056: 22 00 00
ret                            ; 0059: C9
; func main end

; symbols:
; label main = $0000
; var idx = $1000
; var arr = $1001
; var out = $1011
; label getb = $1234
; label getw = $1240
; label ping = $1250
