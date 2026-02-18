; ZAX lowered .asm trace
; range: $0100..$0151 (end exclusive)

; func inc_one begin
inc_one:
push IX                        ; 0100: DD E5
ld IX, $0000                   ; 0102: DD 21 00 00
add IX, SP                     ; 0106: DD 39
ld HL, $0000                   ; 0108: 21 00 00
push HL                        ; 010B: E5
ld HL, $0064                   ; 010C: 21 64 00
push HL                        ; 010F: E5
push AF                        ; 0110: F5
push BC                        ; 0111: C5
push DE                        ; 0112: D5
ld E, (IX + $0004)             ; 0113: DD 5E 04
ld D, (IX + $0005)             ; 0116: DD 56 05
inc DE                         ; 0119: 13
ld (IX - $0002), E             ; 011A: DD 73 FE
ld (IX - $0001), D             ; 011D: DD 72 FF
ld E, (IX - $0002)             ; 0120: DD 5E FE
ld D, (IX - $0001)             ; 0123: DD 56 FF
ex DE, HL                      ; 0126: EB
pop DE                         ; 0127: D1
pop BC                         ; 0128: C1
pop AF                         ; 0129: F1
ld SP, IX                      ; 012A: DD F9
pop IX                         ; 012C: DD E1
ret                            ; 012E: C9
; func inc_one end
; func main begin
main:
push IX                        ; 012F: DD E5
ld IX, $0000                   ; 0131: DD 21 00 00
add IX, SP                     ; 0135: DD 39
ld HL, $0000                   ; 0137: 21 00 00
push HL                        ; 013A: E5
ld HL, $0005                   ; 013B: 21 05 00
push HL                        ; 013E: E5
call inc_one                   ; 013F: CD 00 00
inc SP                         ; 0142: 33
inc SP                         ; 0143: 33
ex DE, HL                      ; 0144: EB
ld (IX - $0002), E             ; 0145: DD 73 FE
ld (IX - $0001), D             ; 0148: DD 72 FF
ex DE, HL                      ; 014B: EB
ld SP, IX                      ; 014C: DD F9
pop IX                         ; 014E: DD E1
ret                            ; 0150: C9
; func main end

; symbols:
; label inc_one = $0100
; label main = $012F
