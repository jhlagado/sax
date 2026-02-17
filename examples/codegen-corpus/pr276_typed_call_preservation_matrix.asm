; ZAX lowered .asm trace
; range: $0000..$0049 (end exclusive)

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
ld HL, $0007                   ; 001F: 21 07 00
push HL                        ; 0022: E5
call getb                      ; 0023: CD 00 00
pop BC                         ; 0026: C1
pop IY                         ; 0027: FD E1
pop IX                         ; 0029: DD E1
pop DE                         ; 002B: D1
pop BC                         ; 002C: C1
pop AF                         ; 002D: F1
ld A, L                        ; 002E: 7D
push AF                        ; 002F: F5
push BC                        ; 0030: C5
push DE                        ; 0031: D5
push IX                        ; 0032: DD E5
push IY                        ; 0034: FD E5
ld HL, $0009                   ; 0036: 21 09 00
push HL                        ; 0039: E5
call getw                      ; 003A: CD 00 00
pop BC                         ; 003D: C1
pop IY                         ; 003E: FD E1
pop IX                         ; 0040: DD E1
pop DE                         ; 0042: D1
pop BC                         ; 0043: C1
pop AF                         ; 0044: F1
ld (out), HL                   ; 0045: 22 00 00
ret                            ; 0048: C9
; func main end

; symbols:
; label main = $0000
; var out = $1000
; label getb = $1234
; label getw = $1240
; label ping = $1250
