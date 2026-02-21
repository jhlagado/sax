; ZAX lowered .asm trace
; range: $0100..$0165 (end exclusive)

; func inc_one begin
inc_one:
push IX                        ; 0100: DD E5
ld IX, $0000                   ; 0102: DD 21 00 00
add IX, SP                     ; 0106: DD 39
push AF                        ; 0108: F5
push BC                        ; 0109: C5
push DE                        ; 010A: D5
ld HL, $0022                   ; 010B: 21 22 00
push HL                        ; 010E: E5
ld HL, $0033                   ; 010F: 21 33 00
push HL                        ; 0112: E5
ld E, (IX + $0004)             ; 0113: DD 5E 04
ld D, (IX + $0005)             ; 0116: DD 56 05
inc DE                         ; 0119: 13
ld (IX - $0008), E             ; 011A: DD 73 F8
ld (IX - $0007), D             ; 011D: DD 72 F9
ld E, (IX - $0008)             ; 0120: DD 5E F8
ld D, (IX - $0007)             ; 0123: DD 56 F9
ex DE, HL                      ; 0126: EB
__zax_epilogue_0:
ld HL, $0004                   ; 0127: 21 04 00
add HL, SP                     ; 012A: 39
ld SP, HL                      ; 012B: F9
pop DE                         ; 012C: D1
pop BC                         ; 012D: C1
pop AF                         ; 012E: F1
ld SP, IX                      ; 012F: DD F9
pop IX                         ; 0131: DD E1
ret                            ; 0133: C9
; func inc_one end
; func main begin
main:
push IX                        ; 0134: DD E5
ld IX, $0000                   ; 0136: DD 21 00 00
add IX, SP                     ; 013A: DD 39
push AF                        ; 013C: F5
push BC                        ; 013D: C5
push DE                        ; 013E: D5
push HL                        ; 013F: E5
ld HL, $0011                   ; 0140: 21 11 00
push HL                        ; 0143: E5
ld HL, $0044                   ; 0144: 21 44 00
push HL                        ; 0147: E5
call inc_one                   ; 0148: CD 00 00
inc SP                         ; 014B: 33
inc SP                         ; 014C: 33
push DE                        ; 014D: D5
ex DE, HL                      ; 014E: EB
ld (IX - $000A), E             ; 014F: DD 73 F6
ld (IX - $0009), D             ; 0152: DD 72 F7
ex DE, HL                      ; 0155: EB
pop DE                         ; 0156: D1
__zax_epilogue_1:
ld HL, $0002                   ; 0157: 21 02 00
add HL, SP                     ; 015A: 39
ld SP, HL                      ; 015B: F9
pop HL                         ; 015C: E1
pop DE                         ; 015D: D1
pop BC                         ; 015E: C1
pop AF                         ; 015F: F1
ld SP, IX                      ; 0160: DD F9
pop IX                         ; 0162: DD E1
ret                            ; 0164: C9
; func main end

; symbols:
; label inc_one = $0100
; label __zax_epilogue_0 = $0127
; label main = $0134
; label __zax_epilogue_1 = $0157
