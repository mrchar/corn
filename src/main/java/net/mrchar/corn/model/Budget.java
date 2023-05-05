package net.mrchar.corn.model;

import jakarta.persistence.*;
import lombok.Getter;
import net.mrchar.corn.model.base.AuditableEntity;
import net.mrchar.corn.model.element.Label;

import java.util.Set;

@Getter
@Entity
@Table(name = "budget")
public class Budget extends AuditableEntity {
    @ManyToOne
    @JoinColumn(name = "category_id")
    private Category category;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "budget_label")
    private Set<Label> labels;

    @ManyToOne
    @JoinColumn(name = "space_id")
    private Space space;

    @Column(name = "amount")
    private Double amount;
}
