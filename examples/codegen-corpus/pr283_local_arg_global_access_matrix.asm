; ZAX lowered .asm trace
; range: $0000..$0049 (end exclusive)

; func touch begin
touch:
ret                            ; 0000: C9
; func main begin
; func touch end
main:
push BC                        ; 0001: C5
push BC                        ; 0002: C5
ld HL, $0006                   ; 0003: 21 06 00
add HL, SP                     ; 0006: 39
push AF                        ; 0007: F5
ld A, (HL)                     ; 0008: 7E
inc HL                         ; 0009: 23
ld H, (HL)                     ; 000A: 66
ld L, A                        ; 000B: 6F
pop AF                         ; 000C: F1
push HL                        ; 000D: E5
ld HL, $0002                   ; 000E: 21 02 00
add HL, SP                     ; 0011: 39
pop DE                         ; 0012: D1
ld (hl), e ; inc hl ; ld (hl), d ; 0013: 73 23 72
ld HL, $0000                   ; 0016: 21 00 00
add HL, SP                     ; 0019: 39
push AF                        ; 001A: F5
ld A, (HL)                     ; 001B: 7E
inc HL                         ; 001C: 23
ld H, (HL)                     ; 001D: 66
ld L, A                        ; 001E: 6F
pop AF                         ; 001F: F1
ld (gword), HL                 ; 0020: 22 00 00
ld HL, $0002                   ; 0023: 21 02 00
add HL, SP                     ; 0026: 39
ld A, (hl)                     ; 0027: 7E
ld (gbyte), A                  ; 0028: 32 00 00
push AF                        ; 002B: F5
push BC                        ; 002C: C5
push DE                        ; 002D: D5
push IX                        ; 002E: DD E5
push IY                        ; 0030: FD E5
push HL                        ; 0032: E5
ld HL, (gword)                 ; 0033: 2A 00 00
push HL                        ; 0036: E5
call touch                     ; 0037: CD 00 00
pop BC                         ; 003A: C1
pop HL                         ; 003B: E1
pop IY                         ; 003C: FD E1
pop IX                         ; 003E: DD E1
pop DE                         ; 0040: D1
pop BC                         ; 0041: C1
pop AF                         ; 0042: F1
jp __zax_epilogue_1            ; 0043: C3 00 00
__zax_epilogue_1:
pop BC                         ; 0046: C1
pop BC                         ; 0047: C1
ret                            ; 0048: C9
; func main end

; symbols:
; label touch = $0000
; label main = $0001
; label __zax_epilogue_1 = $0046
; var gword = $1000
; var gbyte = $1002
