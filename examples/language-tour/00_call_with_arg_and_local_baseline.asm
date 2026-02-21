; ZAX lowered .asm trace
; range: $0100..$015A (end exclusive)

; func inc_one begin
inc_one:
push IX                        ; 0100: DD E5
ld IX, $0000                   ; 0102: DD 21 00 00
add IX, SP                     ; 0106: DD 39
ld HL, $0022                   ; 0108: 21 22 00
push HL                        ; 010B: E5
ld HL, $0033                   ; 010C: 21 33 00
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
__zax_epilogue_0:
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
push HL                        ; 0137: E5
ld HL, $0011                   ; 0138: 21 11 00
ex (SP), HL                    ; 013B: E3
push AF                        ; 013C: F5
push BC                        ; 013D: C5
push DE                        ; 013E: D5
push HL                        ; 013F: E5
ld HL, $0044                   ; 0140: 21 44 00
push HL                        ; 0143: E5
call inc_one                   ; 0144: CD 00 00
inc SP                         ; 0147: 33
inc SP                         ; 0148: 33
ex DE, HL                      ; 0149: EB
ld (IX - $0002), E             ; 014A: DD 73 FE
ld (IX - $0001), D             ; 014D: DD 72 FF
ex DE, HL                      ; 0150: EB
__zax_epilogue_1:
pop HL                         ; 0151: E1
pop DE                         ; 0152: D1
pop BC                         ; 0153: C1
pop AF                         ; 0154: F1
ld SP, IX                      ; 0155: DD F9
pop IX                         ; 0157: DD E1
ret                            ; 0159: C9
; func main end

; symbols:
; label inc_one = $0100
; label __zax_epilogue_0 = $0127
; label main = $012F
; label __zax_epilogue_1 = $0151
